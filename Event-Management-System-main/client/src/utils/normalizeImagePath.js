/**
 * Normalizes image paths to work with Next.js Image component
 * Converts Windows file paths to relative paths from /public
 * Handles both local paths and external URLs
 */
export function normalizeImagePath(imagePath) {
    if (!imagePath) return null;
    
    // If it's already a valid URL (http/https), return as-is
    if (imagePath.startsWith("http://") || imagePath.startsWith("https://")) {
        return imagePath;
    }
    
    // If it's already a relative path starting with /, return as-is (but encode spaces)
    if (imagePath.startsWith("/")) {
        return imagePath.replace(/ /g, "%20");
    }
    
    // Convert Windows file paths to relative paths
    let normalized = imagePath;
    
    // Replace backslashes with forward slashes
    normalized = normalized.replace(/\\/g, "/");
    
    // Extract path from /public/img/ onwards
    if (normalized.includes("public/img/") || normalized.includes("public\\img\\")) {
        normalized = normalized.replace(/.*public[\\/]img[\\/]/, "/img/");
    } else if (normalized.includes("img/") || normalized.includes("img\\")) {
        // If it just has img/ somewhere, extract from there
        const match = normalized.match(/[\\/]img[\\/](.+)$/);
        if (match) {
            normalized = `/img/${match[1]}`;
        }
    }
    
    // URL encode spaces
    normalized = normalized.replace(/ /g, "%20");
    
    return normalized;
}

