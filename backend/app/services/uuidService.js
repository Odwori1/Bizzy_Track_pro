// File: ~/Bizzy_Track_pro/backend/app/services/uuidService.js
// PURPOSE: Production-grade UUID generation with multiple strategies
// VERSION: 1.0.0

import { getClient } from '../utils/database.js';
import { log } from '../utils/logger.js';
import crypto from 'crypto';

export class UUIDService {
    
    // Cache for database UUID generation to reduce connections
    static #uuidCache = [];
    static #cacheSize = 10;
    static #cacheEnabled = true;
    static #useDatabaseUUID = true; // Can be toggled via config
    
    /**
     * Initialize UUID cache with pre-generated UUIDs
     * Call this once during app startup
     */
    static async initializeCache(size = 10) {
        if (!this.#cacheEnabled) return;
        
        this.#cacheSize = Math.min(size, 50); // Max 50 UUIDs in cache
        this.#uuidCache = [];
        
        try {
            const uuids = await this.#generateDatabaseUUIDs(this.#cacheSize);
            this.#uuidCache.push(...uuids);
            log.info('UUID cache initialized', { count: this.#uuidCache.length });
        } catch (error) {
            log.error('Failed to initialize UUID cache', { error: error.message });
            this.#cacheEnabled = false;
        }
    }
    
    /**
     * Generate multiple UUIDs from database in one query
     */
    static async #generateDatabaseUUIDs(count) {
        const client = await getClient();
        try {
            const result = await client.query(
                `SELECT gen_random_uuid() as id 
                 FROM generate_series(1, $1)`,
                [count]
            );
            return result.rows.map(row => row.id);
        } finally {
            client.release();
        }
    }
    
    /**
     * PRIMARY METHOD: Get a UUID from cache or generate new one
     * This is the main method to use throughout the application
     */
    static async getUUID(options = {}) {
        const { 
            useCache = true, 
            forceDatabase = false,
            context = 'general'
        } = options;
        
        // Try cache first if enabled
        if (useCache && this.#cacheEnabled && this.#uuidCache.length > 0) {
            const uuid = this.#uuidCache.pop();
            
            // Asynchronously refill cache if it's getting low
            if (this.#uuidCache.length < this.#cacheSize / 2) {
                this.#refillCache().catch(error => {
                    log.error('Failed to refill UUID cache', { error: error.message });
                });
            }
            
            log.debug('UUID retrieved from cache', { context });
            return uuid;
        }
        
        // Generate new UUID from database
        try {
            const uuid = await this.#generateDatabaseUUID();
            log.debug('UUID generated from database', { context });
            return uuid;
        } catch (error) {
            log.error('Database UUID generation failed, using fallback', { 
                error: error.message,
                context 
            });
            
            // Fallback to crypto-based UUID
            return this.#generateCryptoUUID();
        }
    }
    
    /**
     * Generate a single UUID from database
     */
    static async #generateDatabaseUUID() {
        const client = await getClient();
        try {
            const result = await client.query('SELECT gen_random_uuid() as id');
            return result.rows[0].id;
        } finally {
            client.release();
        }
    }
    
    /**
     * Asynchronously refill the UUID cache
     */
    static async #refillCache() {
        if (!this.#cacheEnabled) return;
        
        const needed = this.#cacheSize - this.#uuidCache.length;
        if (needed <= 0) return;
        
        try {
            const newUuids = await this.#generateDatabaseUUIDs(needed);
            this.#uuidCache.push(...newUuids);
            log.debug('UUID cache refilled', { added: newUuids.length, total: this.#uuidCache.length });
        } catch (error) {
            log.error('Failed to refill UUID cache', { error: error.message });
        }
    }
    
    /**
     * Generate RFC4122 compliant UUID v4 using crypto
     * This is the most reliable fallback
     */
    static #generateCryptoUUID() {
        // Generate 16 random bytes
        const bytes = crypto.randomBytes(16);
        
        // Set version (4) and variant (2) bits
        bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
        bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 1 (RFC4122)
        
        // Convert to hex string with hyphens
        const hex = bytes.toString('hex');
        return [
            hex.substr(0, 8),
            hex.substr(8, 4),
            hex.substr(12, 4),
            hex.substr(16, 4),
            hex.substr(20, 12)
        ].join('-');
    }
    
    /**
     * Synchronous UUID generation for when async is not possible
     * Warning: This bypasses the database and cache
     */
    static getUUIDSync() {
        return this.#generateCryptoUUID();
    }
    
    /**
     * Batch generate multiple UUIDs efficiently
     */
    static async getUUIDs(count, options = {}) {
        const { useCache = true, forceDatabase = false } = options;
        
        if (useCache && this.#cacheEnabled && this.#uuidCache.length >= count) {
            const uuids = [];
            for (let i = 0; i < count; i++) {
                uuids.push(this.#uuidCache.pop());
            }
            
            // Refill cache asynchronously
            this.#refillCache().catch(error => {
                log.error('Failed to refill UUID cache after batch', { error: error.message });
            });
            
            return uuids;
        }
        
        // Generate from database in one query
        try {
            return await this.#generateDatabaseUUIDs(count);
        } catch (error) {
            log.error('Batch database UUID generation failed, using crypto fallback', { 
                error: error.message,
                count 
            });
            
            // Fallback to crypto for each UUID
            const uuids = [];
            for (let i = 0; i < count; i++) {
                uuids.push(this.#generateCryptoUUID());
            }
            return uuids;
        }
    }
    
    /**
     * Validate if a string is a proper UUID
     */
    static isValidUUID(uuid) {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        return uuidRegex.test(uuid);
    }
    
    /**
     * Clean up any existing manual UUIDs in the database
     * Run this once as a migration
     */
    static async cleanupManualUUIDs(businessId = null) {
        const client = await getClient();
        try {
            const tables = [
                'invoices',
                'invoice_line_items',
                'pos_transactions',
                'pos_transaction_items',
                'discount_allocations',
                'discount_allocation_lines'
            ];
            
            let totalFixed = 0;
            
            for (const table of tables) {
                // Find records with manual UUIDs
                const query = businessId 
                    ? `SELECT id FROM ${table} 
                       WHERE id::text LIKE 'manual-%' 
                          OR (business_id = $1 AND id::text LIKE 'manual-%')`
                    : `SELECT id FROM ${table} WHERE id::text LIKE 'manual-%'`;
                
                const params = businessId ? [businessId] : [];
                const result = await client.query(query, params);
                
                for (const row of result.rows) {
                    const newId = await this.#generateDatabaseUUID();
                    await client.query(
                        `UPDATE ${table} SET id = $1 WHERE id = $2`,
                        [newId, row.id]
                    );
                    totalFixed++;
                }
            }
            
            log.info('Manual UUID cleanup completed', { 
                tables: tables.length,
                recordsFixed: totalFixed,
                businessId: businessId || 'all'
            });
            
            return { totalFixed };
            
        } catch (error) {
            log.error('Failed to cleanup manual UUIDs', { error: error.message });
            throw error;
        } finally {
            client.release();
        }
    }
    
    /**
     * Reset the UUID cache (useful for testing)
     */
    static resetCache() {
        this.#uuidCache = [];
        this.#cacheEnabled = true;
        log.info('UUID cache reset');
    }
    
    /**
     * Configure the UUID service
     */
    static configure(config = {}) {
        if (config.cacheSize !== undefined) {
            this.#cacheSize = Math.min(config.cacheSize, 50);
        }
        
        if (config.cacheEnabled !== undefined) {
            this.#cacheEnabled = config.cacheEnabled;
        }
        
        if (config.useDatabaseUUID !== undefined) {
            this.#useDatabaseUUID = config.useDatabaseUUID;
        }
        
        log.info('UUID service configured', {
            cacheSize: this.#cacheSize,
            cacheEnabled: this.#cacheEnabled,
            useDatabaseUUID: this.#useDatabaseUUID
        });
    }
}
