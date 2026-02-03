import { ProductService } from '../services/productService.js';
import { TaxService } from '../services/taxService.js';  // NEW IMPORT
import { log } from '../utils/logger.js';

export const productController = {
  async createProduct(req, res, next) {
    try {
      const productData = req.body;
      const userId = req.user.userId;
      const businessId = req.user.businessId;

      log.info('Creating product', { 
        businessId, 
        userId, 
        productName: productData.name,
        taxCategory: productData.tax_category_code || 'STANDARD_GOODS (default)'
      });

      // ================ NEW: TAX CATEGORY VALIDATION ================
      // Note: Joi schema already validates, but we add extra logging
      if (productData.tax_category_code) {
        log.debug('Product tax category provided:', {
          category: productData.tax_category_code,
          businessId
        });
      } else {
        log.debug('Using default tax category: STANDARD_GOODS', { businessId });
      }

      const newProduct = await ProductService.createProduct(businessId, productData, userId);

      res.status(201).json({
        success: true,
        message: 'Product created successfully',
        data: newProduct
      });

    } catch (error) {
      log.error('Product creation controller error', error);
      next(error);
    }
  },

  async getProducts(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const { 
        category_id, 
        is_active, 
        low_stock, 
        has_variants, 
        search, 
        page, 
        limit 
      } = req.query;

      const filters = {};
      if (category_id) filters.category_id = category_id;
      if (is_active !== undefined) filters.is_active = is_active === 'true';
      if (low_stock !== undefined) filters.low_stock = low_stock === 'true';
      if (has_variants !== undefined) filters.has_variants = has_variants === 'true';
      if (search) filters.search = search;
      if (page) filters.page = parseInt(page);
      if (limit) filters.limit = parseInt(limit);

      const products = await ProductService.getProducts(businessId, filters);

      res.json({
        success: true,
        data: products,
        count: products.length,
        message: 'Products fetched successfully'
      });

    } catch (error) {
      log.error('Products fetch controller error', error);
      next(error);
    }
  },

  async getProductById(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const { id } = req.params;

      const product = await ProductService.getProductById(businessId, id);

      // ================ NEW: ADD TAX INFO TO PRODUCT RESPONSE ================
      if (product && product.tax_category_code) {
        try {
          const taxRateInfo = await TaxService.getTaxRate(
            product.tax_category_code, 
            'UG' // Default to Uganda for now
          );
          
          // Add tax info to product response
          product.tax_info = {
            category_code: product.tax_category_code,
            tax_rate: taxRateInfo.taxRate,
            tax_code: taxRateInfo.taxCode,
            is_exempt: taxRateInfo.isExempt,
            is_zero_rated: taxRateInfo.isZeroRated
          };
        } catch (taxError) {
          log.warn('Could not fetch tax info for product:', {
            productId: id,
            taxCategory: product.tax_category_code,
            error: taxError.message
          });
          product.tax_info = {
            error: 'Tax information unavailable',
            category_code: product.tax_category_code
          };
        }
      }

      res.json({
        success: true,
        data: product,
        message: 'Product fetched successfully'
      });

    } catch (error) {
      log.error('Product fetch by ID controller error', error);
      next(error);
    }
  },

  async updateProduct(req, res, next) {
    try {
      const { id } = req.params;
      const updateData = req.body;
      const userId = req.user.userId;
      const businessId = req.user.businessId;

      log.info('Updating product', { 
        businessId, 
        userId, 
        productId: id,
        taxCategory: updateData.tax_category_code || 'not updated'
      });

      // ================ NEW: LOG TAX CATEGORY CHANGE ================
      if (updateData.tax_category_code) {
        log.debug('Updating product tax category:', {
          productId: id,
          newTaxCategory: updateData.tax_category_code,
          businessId
        });
      }

      const updatedProduct = await ProductService.updateProduct(businessId, id, updateData, userId);

      res.json({
        success: true,
        message: 'Product updated successfully',
        data: updatedProduct
      });

    } catch (error) {
      log.error('Product update controller error', error);
      next(error);
    }
  },

  async createProductVariant(req, res, next) {
    try {
      const variantData = req.body;
      const userId = req.user.userId;
      const businessId = req.user.businessId;

      log.info('Creating product variant', { businessId, userId, productId: variantData.product_id });

      const newVariant = await ProductService.createProductVariant(businessId, variantData, userId);

      res.status(201).json({
        success: true,
        message: 'Product variant created successfully',
        data: newVariant
      });

    } catch (error) {
      log.error('Product variant creation controller error', error);
      next(error);
    }
  },

  async getProductVariants(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const { productId } = req.params;

      const variants = await ProductService.getProductVariants(businessId, productId);

      res.json({
        success: true,
        data: variants,
        count: variants.length,
        message: 'Product variants fetched successfully'
      });

    } catch (error) {
      log.error('Product variants fetch controller error', error);
      next(error);
    }
  },

  async getStatistics(req, res, next) {
    try {
      const businessId = req.user.businessId;

      const statistics = await ProductService.getProductStatistics(businessId);

      res.json({
        success: true,
        data: statistics,
        message: 'Product statistics fetched successfully'
      });

    } catch (error) {
      log.error('Product statistics fetch controller error', error);
      next(error);
    }
  }
};
