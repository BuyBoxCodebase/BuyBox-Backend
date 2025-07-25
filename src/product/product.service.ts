import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { CreateVariantDto } from './dto/create-variant.dto';
import { UpdateVariantDto } from './dto/update-variant.dto';

@Injectable()
export class ProductService {
  constructor(
    private readonly cloudinaryService: CloudinaryService,
    private readonly prisma: PrismaService,
  ) {}

  async uploadFiles(files: Array<Express.Multer.File>) {
    return await this.cloudinaryService.uploadImages(files);
  }

  async createProduct(userId: string, data: CreateProductDto) {
    const {
      name,
      description,
      categoryId,
      subCategoryId,
      basePrice,
      images,
      inventory,
      options = [],
      defaultVariant,
    } = data;

    const brand = await this.prisma.brand.findUnique({
      where: {
        userId: userId,
      },
    });

    if (!brand) {
      return {
        success: false,
        message: 'Brand not found for this user',
      };
    }

    if (categoryId) {
      const category = await this.prisma.category.findUnique({
        where: { id: categoryId },
      });
      if (!category) {
        return {
          success: false,
          message: 'Category not found',
        };
      }
    }

    if (subCategoryId) {
      const subCategory = await this.prisma.subCategory.findUnique({
        where: { id: subCategoryId },
      });
      if (!subCategory) {
        return {
          success: false,
          message: 'SubCategory not found',
        };
      }

      if (subCategory.categoryId !== categoryId) {
        return {
          success: false,
          message: 'SubCategory does not belong to the provided Category',
        };
      }
    }

    // Create a transaction to ensure product and default variant are created together
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        // Create the base product
        const newProduct = await tx.product.create({
          data: {
            brand: { connect: { id: brand.id } },
            name,
            description,
            ...(categoryId
              ? {
                  category: {
                    connect: {
                      id: categoryId,
                    },
                  },
                }
              : {}),
            ...(subCategoryId
              ? {
                  subCategory: {
                    connect: {
                      id: subCategoryId,
                    },
                  },
                }
              : {}),
            basePrice: parseFloat(basePrice),
            images,
            // Create product options if provided
            ...(options.length > 0
              ? {
                  options: {
                    create: options.map((option) => ({
                      name: option.name,
                      values: {
                        create: option.values.map((value) => ({
                          value,
                        })),
                      },
                    })),
                  },
                }
              : {}),
            inventory: {
              create: {
                quantity: parseInt(inventory),
              },
            },
          },
          include: {
            options: {
              include: {
                values: true,
              },
            },
          },
        });

        // Create the default variant if provided
        if (defaultVariant) {
          const {
            price,
            stockQuantity,
            images: variantImages = [],
            optionValues = [],
          } = defaultVariant;

          // Create the default variant
          const variant = await tx.productVariant.create({
            data: {
              product: { connect: { id: newProduct.id } },
              price: parseFloat(price),
              isDefault: true,
              images:
                variantImages.length > 0 ? variantImages : newProduct.images,
              // Connect option values if provided
              ...(optionValues.length > 0
                ? {
                    options: {
                      create: optionValues.map((optionValue) => ({
                        optionValue: { connect: { id: optionValue } },
                      })),
                    },
                  }
                : {}),
            },
          });

          // Create inventory for the variant
          await tx.inventory.create({
            data: {
              variant: { connect: { id: variant.id } },
              quantity: Number(stockQuantity) || 0,
            },
          });
        }

        return newProduct;
      });

      return {
        success: true,
        message: 'New Product Added with Default Variant',
      };
    } catch (error) {
      console.error('Transaction failed:', error);
      return {
        success: false,
        message: 'Failed to create product: ' + error.message,
      };
    }
  }

  async createVariant(
    userId: string,
    productId: string,
    data: CreateVariantDto,
  ) {
    const {
      name,
      description,
      price,
      stockQuantity,
      isDefault = false,
      images = [],
      optionValueIds = [],
    } = data;

    // Check if the product exists and belongs to the user's brand
    const product = await this.prisma.product.findFirst({
      where: {
        id: productId,
        brand: {
          userId,
        },
      },
    });

    if (!product) {
      return {
        success: false,
        message:
          "Product not found or you don't have permission to add variants",
      };
    }

    // Validate that option values exist and belong to product's options
    if (optionValueIds.length > 0) {
      const validOptionValues = await this.prisma.productOptionValue.count({
        where: {
          id: { in: optionValueIds },
          option: {
            productId,
          },
        },
      });

      if (validOptionValues !== optionValueIds.length) {
        return {
          success: false,
          message:
            "Some option values are invalid or don't belong to this product",
        };
      }
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        // If this is set as default, un-set any existing default variant
        if (isDefault) {
          await tx.productVariant.updateMany({
            where: {
              productId,
              isDefault: true,
            },
            data: {
              isDefault: false,
            },
          });
        }

        // Create the variant
        const variant = await tx.productVariant.create({
          data: {
            name: name,
            description: description,
            product: { connect: { id: productId } },
            price: parseFloat(price),
            isDefault,
            images: images.length > 0 ? images : product.images,
            // Connect option values if provided
            ...(optionValueIds.length > 0
              ? {
                  options: {
                    create: optionValueIds.map((optionValueId) => ({
                      optionValue: { connect: { id: optionValueId } },
                    })),
                  },
                }
              : {}),
          },
        });

        // Create inventory for the variant
        await tx.inventory.create({
          data: {
            variant: { connect: { id: variant.id } },
            quantity: Number(stockQuantity) || 0,
          },
        });

        return {
          success: true,
          message: 'Variant created successfully',
          variantId: variant.id,
        };
      });
    } catch (error) {
      console.error('Create variant failed:', error);
      if (error.code === 'P2002' && error.meta?.target?.includes('sku')) {
        return {
          success: false,
          message: 'A variant with this SKU already exists',
        };
      }
      return {
        success: false,
        message: 'Failed to create variant: ' + error.message,
      };
    }
  }

  async updateVariant(
    userId: string,
    variantId: string,
    data: UpdateVariantDto,
  ) {
    const {
      name,
      description,
      price,
      isDefault,
      images,
      optionValueIds,
      stockQuantity,
    } = data;

    // Check if the variant exists and belongs to the user's brand
    const variant = await this.prisma.productVariant.findFirst({
      where: {
        id: variantId,
        product: {
          brand: {
            userId,
          },
        },
      },
      include: {
        product: true,
      },
    });

    if (!variant) {
      return {
        success: false,
        message: "Variant not found or you don't have permission to update it",
      };
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        // If this is set as default, un-set any existing default variant
        if (isDefault) {
          await tx.productVariant.updateMany({
            where: {
              productId: variant.productId,
              isDefault: true,
              id: { not: variantId },
            },
            data: {
              isDefault: false,
            },
          });
        }

        // Update the variant
        const updatedVariant = await tx.productVariant.update({
          where: { id: variantId },
          data: {
            ...(name && { name }),
            ...(description && { description }),
            ...(price !== undefined && { price: parseFloat(price) }),
            ...(isDefault !== undefined && { isDefault }),
            ...(images && { images }),
          },
        });

        // Update inventory if stockQuantity is provided
        if (stockQuantity !== undefined) {
          // Check if inventory exists
          const inventory = await tx.inventory.findFirst({
            where: {
              variantId,
            },
          });

          if (inventory) {
            await tx.inventory.updateMany({
              where: {
                productId: variant.productId,
                variantId,
              },
              data: { quantity: Number(stockQuantity) },
            });
          } else {
            await tx.inventory.create({
              data: {
                variant: { connect: { id: variantId } },
                quantity: Number(stockQuantity),
              },
            });
          }
        }

        // Update option values if provided
        if (optionValueIds && optionValueIds.length > 0) {
          // First, delete existing option connections
          await tx.variantOption.deleteMany({
            where: { variantId },
          });

          // Then create new ones
          await Promise.all(
            optionValueIds.map((optionValueId) =>
              tx.variantOption.create({
                data: {
                  variant: { connect: { id: variantId } },
                  optionValue: { connect: { id: optionValueId } },
                },
              }),
            ),
          );
        }

        return {
          success: true,
          message: 'Variant updated successfully',
        };
      });
    } catch (error) {
      console.error('Update variant failed:', error);
      if (error.code === 'P2002' && error.meta?.target?.includes('sku')) {
        return {
          success: false,
          message: 'A variant with this SKU already exists',
        };
      }
      return {
        success: false,
        message: 'Failed to update variant: ' + error.message,
      };
    }
  }

  async deleteVariant(userId: string, variantId: string) {
    // Check if the variant exists and belongs to the user's brand
    const variant = await this.prisma.productVariant.findFirst({
      where: {
        id: variantId,
        product: {
          brand: {
            userId,
          },
        },
      },
      include: {
        product: {
          include: {
            variants: {
              select: { id: true },
            },
          },
        },
      },
    });

    if (!variant) {
      return {
        success: false,
        message: "Variant not found or you don't have permission to delete it",
      };
    }

    // Don't allow deletion if it's the only variant for the product
    if (variant.product.variants.length <= 1) {
      return {
        success: false,
        message:
          'Cannot delete the only variant of a product. Create another variant first or delete the entire product.',
      };
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        // Delete inventory first due to the foreign key constraint
        await tx.inventory.deleteMany({
          where: { variantId },
        });

        // Delete variant options
        await tx.variantOption.deleteMany({
          where: { variantId },
        });

        // Delete the variant
        await tx.productVariant.delete({
          where: { id: variantId },
        });

        // If this was the default variant, set another one as default
        if (variant.isDefault) {
          const anotherVariant = await tx.productVariant.findFirst({
            where: {
              productId: variant.productId,
              id: { not: variantId },
            },
          });

          if (anotherVariant) {
            await tx.productVariant.update({
              where: { id: anotherVariant.id },
              data: { isDefault: true },
            });
          }
        }
      });

      return {
        success: true,
        message: 'Variant deleted successfully',
      };
    } catch (error) {
      console.error('Delete variant failed:', error);
      return {
        success: false,
        message: 'Failed to delete variant: ' + error.message,
      };
    }
  }

  async getProducts({ categoryId }: { categoryId?: string }) {
    const products = await this.prisma.product.findMany({
      where: {
        ...(categoryId ? { categoryId } : {}),
        isVerified: true,
      },
      include: {
        category: true,
        subCategory: true,
        inventory: {
          select: {
            quantity: true,
          },
        },
        variants: {
          include: {
            inventory: true,
            options: {
              include: {
                optionValue: {
                  include: {
                    option: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    // Map the products to include default variant details with simplified variants
    const mappedProducts = products.map((product) => {
      const defaultVariant =
        product.variants.find((v) => v.isDefault) ||
        product.variants[0] ||
        null;

      // Simplified variants with only id, formattedOptions, price and inventory quantity
      const simplifiedVariants = product.variants.map((variant) => {
        // Organize the variant options by option name
        const formattedOptions = variant.options.reduce(
          (acc, opt) => {
            const optionName = opt.optionValue.option.name;
            acc[optionName] = {
              id: opt.optionValueId,
              value: opt.optionValue.value,
              optionId: opt.optionValue.optionId,
            };
            return acc;
          },
          {} as Record<string, { id: string; value: string; optionId: string }>,
        );

        return {
          id: variant.id,
          price: variant.price,
          quantity:
            variant.inventory && variant.inventory.length > 0
              ? variant.inventory[0].quantity
              : 0,
          formattedOptions,
        };
      });

      return {
        ...product,
        price: defaultVariant?.price || product.basePrice,
        inventory:
          defaultVariant?.inventory && defaultVariant.inventory.length > 0
            ? { quantity: defaultVariant.inventory[0].quantity }
            : product.inventory && product.inventory.length > 0
              ? { quantity: product.inventory[0].quantity }
              : { quantity: 0 },
        defaultVariant: defaultVariant
          ? {
              id: defaultVariant.id,
              price: defaultVariant.price,
              quantity:
                defaultVariant.inventory && defaultVariant.inventory.length > 0
                  ? defaultVariant.inventory[0].quantity
                  : 0,
            }
          : null,
        variants: simplifiedVariants,
      };
    });

    // Group products by category or subcategory
    const groupedProducts = mappedProducts.reduce(
      (acc, product) => {
        // Determine grouping key based on whether categoryId is provided
        const groupKey = categoryId
          ? product.subCategory?.name || 'Uncategorized'
          : product.category?.name || 'Uncategorized';

        if (!acc[groupKey]) {
          acc[groupKey] = [];
        }
        acc[groupKey].push(product);
        return acc;
      },
      {} as Record<string, typeof mappedProducts>,
    );

    return groupedProducts;
  }

  async getSellerProducts(userId: string) {
    const products = await this.prisma.product.findMany({
      where: {
        brand: {
          userId: userId,
        },
      },
      include: {
        category: true,
        subCategory: true,
        inventory: {
          select: {
            quantity: true,
            restockDate: true,
          },
        },
        variants: {
          where: { isDefault: true },
          include: {
            inventory: {
              select: {
                quantity: true,
              },
            },
            options: {
              select: {
                optionValue: {
                  select: {
                    value: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    // Map the products to include default variant details
    const mappedProducts = products.map((product) => {
      const defaultVariant = product.variants[0] || null;
      return {
        ...product,
        price: defaultVariant?.price || product.basePrice,
        inventory: defaultVariant?.inventory || null,
        defaultVariant,
        variants: undefined, // Remove the variants array to avoid duplication
      };
    });

    return {
      success: true,
      // products,
      products: mappedProducts,
    };
  }

  async getSingleProduct(productId: string) {
    const product = await this.prisma.product.findUnique({
      where: {
        id: productId,
        isVerified: true,
      },
      include: {
        category: true,
        subCategory: true,
        inventory: {
          select: {
            quantity: true,
          },
        },
        options: {
          select: {
            id: true,
            values: {
              select: {
                id: true,
                value: true,
                option: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
          },
        },
        variants: {
          select: {
            id: true,
            name: true,
            description: true,
            price: true,
            images: true,
            isDefault: true,
            inventory: {
              select: {
                variantId: true,
                quantity: true,
              },
            },
            options: {
              select: {
                id: true,
                optionValue: {
                  select: {
                    value: true,
                  },
                },
              },
            },
          },
        },
      },
      omit: {
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const defaultVariant =
      product.variants.find((v) => v.isDefault) || product.variants[0] || null;

    return {
      ...product,
      defaultVariant,
    };
  }

  async getProductVariantById(variantId: string) {
    const variant = await this.prisma.productVariant.findUnique({
      where: {
        id: variantId,
        isVerified: true,
      },
      include: {
        product: {
          include: {
            category: true,
            subCategory: true,
            options: {
              select: {
                id: true,
                name: true,
                values: {
                  select: {
                    id: true,
                    value: true,
                  },
                },
              },
            },
            variants: {
              include: {
                inventory: {
                  select: {
                    quantity: true,
                  },
                },
                options: {
                  select: {
                    id: true,
                    optionValue: {
                      select: {
                        value: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
        inventory: {
          select: {
            quantity: true,
          },
        },
        options: {
          include: {
            optionValue: {
              select: {
                id: true,
                value: true,
                option: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!variant) {
      throw new NotFoundException('Variant not found');
    }

    // Mark the selected variant in the variants array
    const variants = variant.product.variants.map((v) => ({
      id: v.id,
      productId: v.productId,
      name: v.name,
      description: v.description,
      price: v.price,
      isDefault: v.isDefault,
      images: v.images,
      inventory: v.inventory,
      options: v.options,
      isSelected: v.id === variantId,
    }));

    // Create a clean product object with the selected variant
    const product = {
      id: variant.product.id,
      brandId: variant.product.brandId,
      name: variant.product.name,
      description: variant.product.description,
      images: variant.product.images,
      categoryId: variant.product.categoryId,
      subCategoryId: variant.product.subCategoryId,
      basePrice: variant.product.basePrice,
      attributes: variant.product.attributes,
      category: variant.product.category,
      subCategory: variant.product.subCategory,
      options: variant.product.options,
      variants: variants,
      selectedVariant: {
        id: variant.id,
        productId: variant.productId,
        name: variant.name,
        description: variant.description,
        price: variant.price,
        isDefault: variant.isDefault,
        images: variant.images,
        inventory: variant.inventory,
        options: variant.options,
      },
    };

    return {
      success: true,
      product: product,
    };
  }

  async getProductVariants(
    productId: string,
    optionFilters?: Record<string, string>,
  ) {
    const product = await this.prisma.product.findUnique({
      where: {
        id: productId,
        isVerified: true,
      },
      include: {
        variants: {
          include: {
            inventory: {
              select: {
                quantity: true,
                restockDate: true,
              },
            },
            options: {
              select: {
                optionValue: {
                  select: {
                    id: true,
                    value: true,
                    option: {
                      select: {
                        id: true,
                        name: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    // If no filters provided, return all variants
    if (!optionFilters || Object.keys(optionFilters).length === 0) {
      return {
        success: true,
        variants: product.variants,
      };
    }

    // Filter variants based on option filters
    // For example, if optionFilters = { "Color": "Red", "Size": "M" }
    const filteredVariants = product.variants.filter((variant) => {
      // For each filter key-value pair, check if the variant has a matching option
      return Object.entries(optionFilters).every(
        ([optionName, optionValue]) => {
          return variant.options.some(
            (opt) =>
              opt.optionValue.option.name.trim().toLowerCase() ===
                optionName.trim().toLowerCase() &&
              opt.optionValue.value.trim().toLowerCase() ===
                optionValue.trim().toLowerCase(),
          );
        },
      );
    });

    return {
      success: true,
      variants: filteredVariants,
    };
  }

  async getOptionValues(productId: string) {
    if (!productId) throw new BadRequestException('ProductId is not provided');
    const optionValues = await this.prisma.productOption.findMany({
      where: {
        productId: productId,
      },
      include: {
        _count: true,
        values: {
          select: {
            id: true,
            value: true,
          },
        },
      },
      omit: {
        createdAt: true,
        updatedAt: true,
      },
    });
    return optionValues;
  }

  async updateProduct(userId: string, data: UpdateProductDto) {
    const {
      productId,
      name,
      description,
      categoryId,
      subCategoryId,
      basePrice,
      images,
    } = data;

    const product = await this.prisma.product.findUnique({
      where: {
        id: productId,
        brand: {
          userId: userId,
        },
      },
    });

    if (!product) {
      throw new BadRequestException('Error while updating the product');
    }

    if (categoryId) {
      const category = await this.prisma.category.findUnique({
        where: { id: categoryId },
      });
      if (!category) {
        throw new BadRequestException('Category not found');
      }

      if (subCategoryId) {
        const subCategory = await this.prisma.subCategory.findUnique({
          where: { id: subCategoryId },
        });
        if (!subCategory) {
          throw new BadRequestException('SubCategory not found');
        }

        if (subCategory.categoryId !== categoryId) {
          throw new BadRequestException(
            'SubCategory does not belong to the provided Category',
          );
        }
      }
    }

    const updatedProduct = await this.prisma.product.update({
      where: {
        id: productId,
      },
      data: {
        ...(name && { name }),
        ...(description && { description }),
        ...(categoryId && {
          category: {
            connect: { id: categoryId },
          },
        }),
        ...(subCategoryId && {
          subCategory: {
            connect: { id: subCategoryId },
          },
        }),
        ...(basePrice && { basePrice: parseFloat(basePrice) }),
        ...(images && { images }),
      },
    });

    if (!updatedProduct) {
      return {
        success: false,
        message: 'Failed to update product',
      };
    }

    return {
      success: true,
      message: 'Updated the product successfully',
    };
  }

  async deleteProduct(userId: string, productId: string) {
    const existsProduct = await this.prisma.product.findUnique({
      where: {
        id: productId,
        brand: {
          userId: userId,
        },
      },
    });

    if (!existsProduct) {
      throw new BadRequestException("You can't delete this product");
    }

    try {
      // Prisma will cascade delete all related records (variants, options, etc.)
      await this.prisma.product.delete({
        where: {
          id: productId,
        },
      });

      return {
        success: true,
        message: 'Product deleted',
      };
    } catch (error) {
      console.error('Delete product failed:', error);
      return {
        success: false,
        message: 'Failed to delete product: ' + error.message,
      };
    }
  }

  async addProductOptionValues({
    productId,
    options,
  }: {
    productId: string;
    options: Array<{
      optionName: string;
      values: string[];
    }>;
  }) {
    // Check if the product exists
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: {
        options: {
          include: { values: true },
        },
      },
    });

    if (!product) {
      throw new Error('Product not found');
    }

    const results = [];

    // Process each option and its values
    for (const { optionName, values } of options) {
      // Find the existing option
      let option = product.options.find((opt) => opt.name === optionName);

      if (!option) {
        // Create a new option if it doesn't exist
        option = await this.prisma.productOption.create({
          data: {
            productId,
            name: optionName,
          },
          include: {
            values: true,
          },
        });
      } else {
        // Make sure we have the values for this option
        if (!option.values) {
          option.values = await this.prisma.productOptionValue.findMany({
            where: { optionId: option.id },
          });
        }
      }

      // Filter out values that already exist
      const existingValues = option.values.map((v) => v.value.toLowerCase());
      const valuesToAdd = values.filter(
        (value) => !existingValues.includes(value.toLowerCase()),
      );

      let createdValues = [];
      let message = 'No new values to add';

      if (valuesToAdd.length > 0) {
        // Create the new option values
        createdValues = await Promise.all(
          valuesToAdd.map((value) =>
            this.prisma.productOptionValue.create({
              data: {
                optionId: option.id,
                value: value,
              },
            }),
          ),
        );

        message = `Successfully added ${createdValues.length} new option values`;
      }

      // Get all values for this option including the newly added ones
      const allValues = await this.prisma.productOptionValue.findMany({
        where: { optionId: option.id },
      });

      results.push({
        optionId: option.id,
        optionName,
        message,
        addedValues: createdValues,
        allValues,
      });
    }

    return {
      productId,
      message: `Processed ${results.length} options`,
      results,
    };
  }
}
