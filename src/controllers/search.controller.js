import prisma from "../db/db.js";

async function globalSearch(req, res)
{
  try
  {
    const query=req.query.q || req.query.query;

    // ✅ Validate query
    if (!query||query.trim().length<2)
    {
      return res.status(400).json({
        success: false,
        message: "Search query must be at least 2 characters"
      });
    }

    // Enhanced product search with all necessary fields
    let products;
    try {
      // Try using similarity function first
      products=await prisma.$queryRaw`
        SELECT 
          p.id,
          p.name,
          p.slug,
          p.description,
          p.price,
          p."discountPrice",
          p."stockQuantity",
          p."isActive",
          p."isTrending",
          p.sku,
          p."categoryId",
          p."concernId",
          c.name as "categoryName",
          c.slug as "categorySlug",
          similarity(p.name, ${query}) AS score,
          COALESCE(
            JSON_AGG(
              JSON_BUILD_OBJECT(
                'id', pi.id,
                'imageUrl', pi."imageUrl",
                'isPrimary', pi."isPrimary",
                'position', pi.position,
                'altText', pi."altText"
              ) ORDER BY pi.position
            ) FILTER (WHERE pi.id IS NOT NULL), 
            '[]'
          ) as images
        FROM "Product" p
        LEFT JOIN "Category" c ON p."categoryId" = c.id
        LEFT JOIN "ProductImage" pi ON p.id = pi."productId"
        WHERE 
          p."isActive" = true 
          AND similarity(p.name, ${query}) > 0.3
        GROUP BY p.id, c.name, c.slug
        ORDER BY score DESC
        LIMIT 10;
      `;
    } catch (similarityError) {
      // Using ILIKE fallback for search
      
      // Fallback to ILIKE search
      products=await prisma.$queryRaw`
        SELECT 
          p.id,
          p.name,
          p.slug,
          p.description,
          p.price,
          p."discountPrice",
          p."stockQuantity",
          p."isActive",
          p."isTrending",
          p.sku,
          p."categoryId",
          p."concernId",
          c.name as "categoryName",
          c.slug as "categorySlug",
          COALESCE(
            JSON_AGG(
              JSON_BUILD_OBJECT(
                'id', pi.id,
                'imageUrl', pi."imageUrl",
                'isPrimary', pi."isPrimary",
                'position', pi.position,
                'altText', pi."altText"
              ) ORDER BY pi.position
            ) FILTER (WHERE pi.id IS NOT NULL), 
            '[]'
          ) as images
        FROM "Product" p
        LEFT JOIN "Category" c ON p."categoryId" = c.id
        LEFT JOIN "ProductImage" pi ON p.id = pi."productId"
        WHERE 
          p."isActive" = true 
          AND p.name ILIKE ${'%' + query + '%'}
        GROUP BY p.id, c.name, c.slug
        ORDER BY p.name
        LIMIT 10;
      `;
    }

    // Enhanced category search
    let categories;
    try {
      categories=await prisma.$queryRaw`
        SELECT 
          c.id,
          c.name,
          c.slug,
          c.description,
          c."imageUrl",
          c."isActive",
          similarity(c.name, ${query}) AS score
        FROM "Category" c
        WHERE 
          c."isActive" = true 
          AND similarity(c.name, ${query}) > 0.3
        ORDER BY score DESC
        LIMIT 10;
      `;
    } catch (similarityError) {
      // Using ILIKE fallback for categories
      
      // Fallback to ILIKE search
      categories=await prisma.$queryRaw`
        SELECT 
          c.id,
          c.name,
          c.slug,
          c.description,
          c."imageUrl",
          c."isActive"
        FROM "Category" c
        WHERE 
          c."isActive" = true 
          AND c.name ILIKE ${'%' + query + '%'}
        ORDER BY c.name
        LIMIT 10;
      `;
    }

    return res.status(200).json({
      success: true,
      query,
      products: products.map(product => ({
        ...product,
        images: Array.isArray(product.images) ? product.images : [],
        isFeatured: product.isTrending
      })),
      categories
    });

  } catch (error)
  {
    console.error("Global search error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
}

async function searchSuggestions(req, res)
{
  try
  {
    const query=req.query.q || req.query.query;

    // 🔐 Validation
    if (!query||query.trim().length<1)
    {
      return res.status(200).json({
        success: true,
        suggestions: []
      });
    }

    let products, categories;
    try {
      products=await prisma.$queryRaw`
        SELECT
          id,
          name,
          slug,
          'product' AS type,
          similarity(name, ${query}) AS score
        FROM "Product"
        WHERE
          "isActive" = true
          AND similarity(name, ${query}) > 0.25
        ORDER BY score DESC
        LIMIT 5;
      `;

      categories=await prisma.$queryRaw`
        SELECT
          id,
          name,
          slug,
          'category' AS type,
          similarity(name, ${query}) AS score
        FROM "Category"
        WHERE
          "isActive" = true 
          AND similarity(name, ${query}) > 0.25
        ORDER BY score DESC
        LIMIT 5;
      `;
    } catch (similarityError) {
      // Using ILIKE fallback for suggestions
      
      // Fallback to ILIKE search
      products=await prisma.$queryRaw`
        SELECT
          id,
          name,
          slug,
          'product' AS type
        FROM "Product"
        WHERE
          "isActive" = true
          AND name ILIKE ${'%' + query + '%'}
        ORDER BY name
        LIMIT 5;
      `;

      categories=await prisma.$queryRaw`
        SELECT
          id,
          name,
          slug,
          'category' AS type
        FROM "Category"
        WHERE
          "isActive" = true 
          AND name ILIKE ${'%' + query + '%'}
        ORDER BY name
        LIMIT 5;
      `;
    }

    return res.status(200).json({
      success: true,
      suggestions: [...categories, ...products]
    });

  } catch (error)
  {
    console.error("Search suggestion error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
}
async function searchProducts(req, res)
{
  try
  {
    const query=req.query.q || req.query.query;
    if (!query||query.trim().length<2)
    {
      return res.status(400).json({
        success: false,
        message: "Search query must be at least 2 characters"
      });
    }

    let products;
    try {
      products=await prisma.$queryRaw`
        SELECT 
          p.id,
          p.name,
          p.slug,
          p.description,
          p.price,
          p."discountPrice",
          p."stockQuantity",
          p."isActive",
          p."isTrending",
          p.sku,
          p."categoryId",
          p."concernId",
          c.name as "categoryName",
          c.slug as "categorySlug",
          similarity(p.name, ${query}) AS score,
          COALESCE(
            JSON_AGG(
              JSON_BUILD_OBJECT(
                'id', pi.id,
                'imageUrl', pi."imageUrl",
                'isPrimary', pi."isPrimary",
                'position', pi.position,
                'altText', pi."altText"
              ) ORDER BY pi.position
            ) FILTER (WHERE pi.id IS NOT NULL), 
            '[]'
          ) as images
        FROM "Product" p
        LEFT JOIN "Category" c ON p."categoryId" = c.id
        LEFT JOIN "ProductImage" pi ON p.id = pi."productId"
        WHERE 
          p."isActive" = true 
          AND similarity(p.name, ${query}) > 0.3
        GROUP BY p.id, c.name, c.slug
        ORDER BY score DESC
        LIMIT 20;
      `;
    } catch (similarityError) {
      // Using ILIKE fallback for product search
      
      // Fallback to ILIKE search
      products=await prisma.$queryRaw`
        SELECT 
          p.id,
          p.name,
          p.slug,
          p.description,
          p.price,
          p."discountPrice",
          p."stockQuantity",
          p."isActive",
          p."isTrending",
          p.sku,
          p."categoryId",
          p."concernId",
          c.name as "categoryName",
          c.slug as "categorySlug",
          COALESCE(
            JSON_AGG(
              JSON_BUILD_OBJECT(
                'id', pi.id,
                'imageUrl', pi."imageUrl",
                'isPrimary', pi."isPrimary",
                'position', pi.position,
                'altText', pi."altText"
              ) ORDER BY pi.position
            ) FILTER (WHERE pi.id IS NOT NULL), 
            '[]'
          ) as images
        FROM "Product" p
        LEFT JOIN "Category" c ON p."categoryId" = c.id
        LEFT JOIN "ProductImage" pi ON p.id = pi."productId"
        WHERE 
          p."isActive" = true 
          AND p.name ILIKE ${'%' + query + '%'}
        GROUP BY p.id, c.name, c.slug
        ORDER BY p.name
        LIMIT 20;
      `;
    }

    return res.status(200).json({
      success: true,
      query,
      products: products.map(product => ({
        ...product,
        images: Array.isArray(product.images) ? product.images : [],
        isFeatured: product.isTrending
      }))
    });
  }
  catch (error)
  {
    console.error("Product search error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
}


export {globalSearch, searchSuggestions, searchProducts};