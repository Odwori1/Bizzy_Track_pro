import { query, getClient } from '../utils/database.js';
import { log } from '../utils/logger.js';
import { auditLogger } from '../utils/auditLogger.js';

export const packageService = {
  async createPackage(packageData, userId, businessId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      // Create the package
      const createPackageQuery = `
        INSERT INTO service_packages
        (business_id, name, description, base_price, duration_minutes,
         category, is_customizable, min_services, max_services, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
      `;

      const packageValues = [
        businessId,
        packageData.name,
        packageData.description || '',
        packageData.base_price,
        packageData.duration_minutes,
        packageData.category || 'General',
        packageData.is_customizable || false,
        packageData.min_services || 1,
        packageData.max_services || null,
        userId
      ];

      const packageResult = await client.query(createPackageQuery, packageValues);
      const newPackage = packageResult.rows[0];

      // Add services to package with enhanced deconstruction features
      if (packageData.services && packageData.services.length > 0) {
        for (const serviceData of packageData.services) {
          const addServiceQuery = `
            INSERT INTO package_services
            (package_id, service_id, is_required, default_quantity,
             max_quantity, package_price, is_price_overridden,
             service_dependencies, timing_constraints, resource_requirements, substitution_rules)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          `;

          const serviceValues = [
            newPackage.id,
            serviceData.service_id,
            serviceData.is_required || false,
            serviceData.default_quantity || 1,
            serviceData.max_quantity || null,
            serviceData.package_price || null,
            serviceData.package_price !== undefined && serviceData.package_price !== null,
            serviceData.service_dependencies || [],
            serviceData.timing_constraints || null,
            serviceData.resource_requirements || null,
            serviceData.substitution_rules || null
          ];

          await client.query(addServiceQuery, serviceValues);
        }
      }

      // Add deconstruction rules if provided
      if (packageData.deconstruction_rules && packageData.deconstruction_rules.length > 0) {
        for (const ruleData of packageData.deconstruction_rules) {
          const addRuleQuery = `
            INSERT INTO package_deconstruction_rules
            (package_id, rule_type, rule_conditions, rule_actions, priority, is_active)
            VALUES ($1, $2, $3, $4, $5, $6)
          `;

          const ruleValues = [
            newPackage.id,
            ruleData.rule_type,
            ruleData.rule_conditions,
            ruleData.rule_actions,
            ruleData.priority || 1,
            ruleData.is_active !== undefined ? ruleData.is_active : true
          ];

          await client.query(addRuleQuery, ruleValues);
        }
      }

      // Log the audit action
      await auditLogger.logAction({
        businessId,
        userId,
        action: 'package.created',
        resourceType: 'package',
        resourceId: newPackage.id,
        newValues: newPackage
      });

      await client.query('COMMIT');

      log.info('Package created', {
        packageId: newPackage.id,
        businessId,
        userId,
        packageName: newPackage.name,
        serviceCount: packageData.services?.length || 0,
        ruleCount: packageData.deconstruction_rules?.length || 0
      });

      // Return the complete package with services and rules
      return await this.getPackageById(newPackage.id, businessId);

    } catch (error) {
      await client.query('ROLLBACK');
      log.error('Package creation failed', error);
      throw error;
    } finally {
      client.release();
    }
  },

  async getAllPackages(businessId, options = {}) {
    const client = await getClient();
    try {
      let selectQuery = `
        SELECT
          sp.id, sp.name, sp.description, sp.base_price, sp.duration_minutes,
          sp.category, sp.is_customizable, sp.min_services, sp.max_services,
          sp.is_active, sp.created_at, sp.updated_at,
          COUNT(ps.service_id) as service_count
        FROM service_packages sp
        LEFT JOIN package_services ps ON sp.id = ps.package_id
        WHERE sp.business_id = $1
      `;

      const values = [businessId];
      let paramCount = 2;

      // Filter by active status if provided
      if (options.activeOnly) {
        selectQuery += ` AND sp.is_active = $${paramCount}`;
        values.push(true);
        paramCount++;
      }

      // Filter by category if provided
      if (options.category) {
        selectQuery += ` AND sp.category = $${paramCount}`;
        values.push(options.category);
        paramCount++;
      }

      // Filter by customizable if provided
      if (options.customizableOnly) {
        selectQuery += ` AND sp.is_customizable = $${paramCount}`;
        values.push(true);
        paramCount++;
      }

      selectQuery += ` GROUP BY sp.id ORDER BY sp.name`;

      const result = await client.query(selectQuery, values);

      log.debug('Fetched packages', {
        businessId,
        count: result.rows.length,
        filters: options
      });

      return result.rows;
    } catch (error) {
      log.error('Failed to fetch packages', error);
      throw error;
    } finally {
      client.release();
    }
  },

  async getPackageById(id, businessId) {
    const client = await getClient();
    try {
      // Get package details
      const packageQuery = `
        SELECT
          sp.id, sp.name, sp.description, sp.base_price, sp.duration_minutes,
          sp.category, sp.is_customizable, sp.min_services, sp.max_services,
          sp.is_active, sp.created_at, sp.updated_at
        FROM service_packages sp
        WHERE sp.id = $1 AND sp.business_id = $2
      `;

      const packageResult = await client.query(packageQuery, [id, businessId]);
      const servicePackage = packageResult.rows[0] || null;

      if (!servicePackage) {
        log.debug('Package not found', { packageId: id, businessId });
        return null;
      }

      // Get package services with enhanced deconstruction features
      const servicesQuery = `
        SELECT
          ps.*,
          s.name as service_name,
          s.description as service_description,
          s.base_price as service_base_price,
          s.duration_minutes as service_duration,
          s.category as service_category
        FROM package_services ps
        JOIN services s ON ps.service_id = s.id
        WHERE ps.package_id = $1
        ORDER BY s.name
      `;

      const servicesResult = await client.query(servicesQuery, [id]);
      servicePackage.services = servicesResult.rows;

      // Get deconstruction rules
      const rulesQuery = `
        SELECT *
        FROM package_deconstruction_rules
        WHERE package_id = $1 AND is_active = true
        ORDER BY priority DESC, rule_type
      `;

      const rulesResult = await client.query(rulesQuery, [id]);
      servicePackage.deconstruction_rules = rulesResult.rows;

      log.debug('Fetched package by ID', { 
        packageId: id, 
        businessId,
        serviceCount: servicePackage.services.length,
        ruleCount: servicePackage.deconstruction_rules.length
      });

      return servicePackage;
    } catch (error) {
      log.error('Failed to fetch package by ID', error);
      throw error;
    } finally {
      client.release();
    }
  },

  async updatePackage(id, packageData, userId, businessId) {
    const client = await getClient();

    try {
      // First get the current values for audit logging
      const currentPackage = await this.getPackageById(id, businessId);
      if (!currentPackage) {
        throw new Error('Package not found');
      }

      await client.query('BEGIN');

      const updateFields = [];
      const values = [];
      let paramCount = 1;

      // Build dynamic update query
      if (packageData.name !== undefined) {
        updateFields.push(`name = $${paramCount}`);
        values.push(packageData.name);
        paramCount++;
      }

      if (packageData.description !== undefined) {
        updateFields.push(`description = $${paramCount}`);
        values.push(packageData.description);
        paramCount++;
      }

      if (packageData.base_price !== undefined) {
        updateFields.push(`base_price = $${paramCount}`);
        values.push(packageData.base_price);
        paramCount++;
      }

      if (packageData.duration_minutes !== undefined) {
        updateFields.push(`duration_minutes = $${paramCount}`);
        values.push(packageData.duration_minutes);
        paramCount++;
      }

      if (packageData.category !== undefined) {
        updateFields.push(`category = $${paramCount}`);
        values.push(packageData.category);
        paramCount++;
      }

      if (packageData.is_customizable !== undefined) {
        updateFields.push(`is_customizable = $${paramCount}`);
        values.push(packageData.is_customizable);
        paramCount++;
      }

      if (packageData.min_services !== undefined) {
        updateFields.push(`min_services = $${paramCount}`);
        values.push(packageData.min_services);
        paramCount++;
      }

      if (packageData.max_services !== undefined) {
        updateFields.push(`max_services = $${paramCount}`);
        values.push(packageData.max_services);
        paramCount++;
      }

      if (packageData.is_active !== undefined) {
        updateFields.push(`is_active = $${paramCount}`);
        values.push(packageData.is_active);
        paramCount++;
      }

      if (updateFields.length === 0) {
        throw new Error('No valid fields to update');
      }

      updateFields.push(`updated_at = CURRENT_TIMESTAMP`);

      values.push(id, businessId);

      const updateQuery = `
        UPDATE service_packages
        SET ${updateFields.join(', ')}
        WHERE id = $${paramCount} AND business_id = $${paramCount + 1}
        RETURNING *
      `;

      const result = await client.query(updateQuery, values);
      const updatedPackage = result.rows[0];

      // Update deconstruction rules if provided
      if (packageData.deconstruction_rules !== undefined) {
        // First deactivate all existing rules
        await client.query(
          'UPDATE package_deconstruction_rules SET is_active = false WHERE package_id = $1',
          [id]
        );

        // Insert new rules
        if (packageData.deconstruction_rules.length > 0) {
          for (const ruleData of packageData.deconstruction_rules) {
            const addRuleQuery = `
              INSERT INTO package_deconstruction_rules
              (package_id, rule_type, rule_conditions, rule_actions, priority, is_active)
              VALUES ($1, $2, $3, $4, $5, $6)
            `;

            const ruleValues = [
              id,
              ruleData.rule_type,
              ruleData.rule_conditions,
              ruleData.rule_actions,
              ruleData.priority || 1,
              ruleData.is_active !== undefined ? ruleData.is_active : true
            ];

            await client.query(addRuleQuery, ruleValues);
          }
        }
      }

      // Log the audit action
      await auditLogger.logAction({
        businessId,
        userId,
        action: 'package.updated',
        resourceType: 'package',
        resourceId: id,
        oldValues: currentPackage,
        newValues: updatedPackage
      });

      await client.query('COMMIT');

      log.info('Package updated', {
        packageId: id,
        businessId,
        userId
      });

      return await this.getPackageById(id, businessId);

    } catch (error) {
      await client.query('ROLLBACK');
      log.error('Package update failed', error);
      throw error;
    } finally {
      client.release();
    }
  },

  async deletePackage(id, userId, businessId) {
    const client = await getClient();

    try {
      // First get the current values for audit logging
      const currentPackage = await this.getPackageById(id, businessId);
      if (!currentPackage) {
        throw new Error('Package not found');
      }

      await client.query('BEGIN');

      // Soft delete by setting is_active to false
      const deleteQuery = `
        UPDATE service_packages
        SET is_active = false, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND business_id = $2
        RETURNING *
      `;

      const result = await client.query(deleteQuery, [id, businessId]);
      const deletedPackage = result.rows[0];

      // Also deactivate all deconstruction rules
      await client.query(
        'UPDATE package_deconstruction_rules SET is_active = false WHERE package_id = $1',
        [id]
      );

      // Log the audit action
      await auditLogger.logAction({
        businessId,
        userId,
        action: 'package.deleted',
        resourceType: 'package',
        resourceId: id,
        oldValues: currentPackage,
        newValues: deletedPackage
      });

      await client.query('COMMIT');

      log.info('Package deleted', {
        packageId: id,
        businessId,
        userId
      });

      return deletedPackage;

    } catch (error) {
      await client.query('ROLLBACK');
      log.error('Package deletion failed', error);
      throw error;
    } finally {
      client.release();
    }
  },

  async getPackageCategories(businessId) {
    const client = await getClient();
    try {
      const categoriesQuery = `
        SELECT DISTINCT category
        FROM service_packages
        WHERE business_id = $1 AND is_active = true
        ORDER BY category
      `;

      const result = await client.query(categoriesQuery, [businessId]);

      const categories = result.rows.map(row => row.category);

      log.debug('Fetched package categories', {
        businessId,
        categories
      });

      return categories;
    } catch (error) {
      log.error('Failed to fetch package categories', error);
      throw error;
    } finally {
      client.release();
    }
  },

  // NEW: Package Deconstruction Methods
  async validatePackageDeconstruction(packageId, selectedServices, businessId) {
    const client = await getClient();
    try {
      const pkgData = await this.getPackageById(packageId, businessId);
      if (!pkgData) {
        throw new Error('Package not found');
      }

      const validationResult = {
        isValid: true,
        errors: [],
        warnings: [],
        totalPrice: 0,
        totalDuration: 0
      };

      // Check minimum services constraint
      if (selectedServices.length < pkgData.min_services) {
        validationResult.isValid = false;
        validationResult.errors.push(`Minimum ${pkgData.min_services} services required`);
      }

      // Check maximum services constraint
      if (pkgData.max_services && selectedServices.length > pkgData.max_services) {
        validationResult.isValid = false;
        validationResult.errors.push(`Maximum ${pkgData.max_services} services allowed`);
      }

      // Check required services
      const requiredServices = pkgData.services.filter(s => s.is_required);
      for (const requiredService of requiredServices) {
        if (!selectedServices.find(s => s.service_id === requiredService.service_id)) {
          validationResult.isValid = false;
          validationResult.errors.push(`Required service "${requiredService.service_name}" is missing`);
        }
      }

      // Apply deconstruction rules
      for (const rule of pkgData.deconstruction_rules) {
        const ruleValidation = await this.applyDeconstructionRule(rule, selectedServices, pkgData);
        if (!ruleValidation.isValid) {
          validationResult.isValid = false;
          validationResult.errors.push(...ruleValidation.errors);
        }
        if (ruleValidation.warnings.length > 0) {
          validationResult.warnings.push(...ruleValidation.warnings);
        }
      }

      // Calculate pricing and duration
      for (const selectedService of selectedServices) {
        const packageService = pkgData.services.find(s => s.service_id === selectedService.service_id);
        if (packageService) {
          const servicePrice = packageService.is_price_overridden 
            ? packageService.package_price 
            : packageService.service_base_price;
          
          const quantity = selectedService.quantity || 1;
          validationResult.totalPrice += servicePrice * quantity;
          validationResult.totalDuration += packageService.service_duration * quantity;
        }
      }

      log.debug('Package deconstruction validation', {
        packageId,
        businessId,
        selectedServicesCount: selectedServices.length,
        isValid: validationResult.isValid,
        errorCount: validationResult.errors.length,
        warningCount: validationResult.warnings.length
      });

      return validationResult;

    } catch (error) {
      log.error('Package deconstruction validation failed', error);
      throw error;
    } finally {
      client.release();
    }
  },

  async applyDeconstructionRule(rule, selectedServices, pkgData) {
    const result = {
      isValid: true,
      errors: [],
      warnings: []
    };

    try {
      // This is a simplified rule engine - can be expanded based on rule_type
      switch (rule.rule_type) {
        case 'dependency':
          // Check if required dependencies are met
          const conditions = rule.rule_conditions;
          if (conditions.requires) {
            const requiredService = pkgData.services.find(s => s.service_id === conditions.requires);
            if (requiredService && !selectedServices.find(s => s.service_id === conditions.requires)) {
              result.isValid = false;
              result.errors.push(`Service requires "${requiredService.service_name}" to be selected`);
            }
          }
          break;

        case 'timing':
          // Check timing constraints
          const timingConditions = rule.rule_conditions;
          if (timingConditions.before || timingConditions.after) {
            // Implement timing logic based on service sequencing
            result.warnings.push('Timing constraints would be validated during scheduling');
          }
          break;

        case 'pricing':
          // Apply pricing rules
          const pricingActions = rule.rule_actions;
          if (pricingActions.adjustment) {
            // This would adjust the final price calculation
            result.warnings.push('Pricing rules will be applied to final calculation');
          }
          break;

        case 'substitution':
          // Handle service substitutions
          const substitutionConditions = rule.rule_conditions;
          if (substitutionConditions.allows_substitution) {
            // Check if substitutions are valid
            result.warnings.push('Substitution rules are available for this package');
          }
          break;
      }

      return result;
    } catch (error) {
      log.error('Error applying deconstruction rule', error);
      result.isValid = false;
      result.errors.push('Error applying package rules');
      return result;
    }
  },

  async getDeconstructionRules(packageId, businessId) {
    const client = await getClient();
    try {
      const rulesQuery = `
        SELECT *
        FROM package_deconstruction_rules
        WHERE package_id = $1 AND is_active = true
        ORDER BY priority DESC, rule_type
      `;

      const result = await client.query(rulesQuery, [packageId]);

      log.debug('Fetched deconstruction rules', {
        packageId,
        businessId,
        ruleCount: result.rows.length
      });

      return result.rows;
    } catch (error) {
      log.error('Failed to fetch deconstruction rules', error);
      throw error;
    } finally {
      client.release();
    }
  },

  async updateDeconstructionRules(packageId, rules, userId, businessId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      // Verify package exists and belongs to business
      const packageVerify = await client.query(
        'SELECT id FROM service_packages WHERE id = $1 AND business_id = $2',
        [packageId, businessId]
      );

      if (packageVerify.rows.length === 0) {
        throw new Error('Package not found');
      }

      // Deactivate all existing rules
      await client.query(
        'UPDATE package_deconstruction_rules SET is_active = false WHERE package_id = $1',
        [packageId]
      );

      // Insert new rules
      for (const ruleData of rules) {
        const insertRuleQuery = `
          INSERT INTO package_deconstruction_rules
          (package_id, rule_type, rule_conditions, rule_actions, priority, is_active)
          VALUES ($1, $2, $3, $4, $5, $6)
        `;

        const ruleValues = [
          packageId,
          ruleData.rule_type,
          ruleData.rule_conditions,
          ruleData.rule_actions,
          ruleData.priority || 1,
          ruleData.is_active !== undefined ? ruleData.is_active : true
        ];

        await client.query(insertRuleQuery, ruleValues);
      }

      // Log the audit action
      await auditLogger.logAction({
        businessId,
        userId,
        action: 'package.rules.updated',
        resourceType: 'package',
        resourceId: packageId,
        newValues: { rules_updated: rules.length }
      });

      await client.query('COMMIT');

      log.info('Deconstruction rules updated', {
        packageId,
        businessId,
        userId,
        ruleCount: rules.length
      });

      return await this.getDeconstructionRules(packageId, businessId);

    } catch (error) {
      await client.query('ROLLBACK');
      log.error('Failed to update deconstruction rules', error);
      throw error;
    } finally {
      client.release();
    }
  }
};
