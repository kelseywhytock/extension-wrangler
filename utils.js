// Utility functions for Extension Wrangler

// Sanitize HTML to prevent XSS
function sanitizeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Validate and sanitize image URLs
function sanitizeImageURL(url) {
  if (!url) return null;
  
  // Only allow specific protocols
  try {
    const parsed = new URL(url);
    if (!['https:', 'chrome:', 'chrome-extension:', 'data:'].includes(parsed.protocol)) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

// Throttle function to limit rapid calls
function throttle(func, limit) {
  let inThrottle;
  return function(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

// Debounce function for search
function debounce(func, delay) {
  let timeoutId;
  return function(...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func.apply(this, args), delay);
  };
}

// Create notification element
function showNotification(message, type = 'info') {
  // Remove any existing notification
  const existing = document.getElementById('notification');
  if (existing) existing.remove();
  
  const notification = document.createElement('div');
  notification.id = 'notification';
  notification.className = `notification notification-${type}`;
  notification.textContent = message;
  notification.setAttribute('role', 'alert');
  notification.setAttribute('aria-live', 'polite');
  
  document.body.appendChild(notification);
  
  // Auto-dismiss after 3 seconds
  setTimeout(() => {
    notification.classList.add('fade-out');
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

// Validate group name
function validateGroupName(name) {
  if (!name || typeof name !== 'string') return false;
  
  // Remove any potentially dangerous characters
  const cleaned = name.trim()
    .replace(/[<>\"'`]/g, '') // Remove potential HTML/JS injection chars
    .substring(0, 50); // Limit length
  
  return cleaned.length > 0 ? cleaned : false;
}

// Create skeleton loader
function createSkeletonLoader() {
  return `
    <div class="skeleton-group">
      <div class="skeleton-header">
        <div class="skeleton-text skeleton-title"></div>
        <div class="skeleton-text skeleton-stats"></div>
      </div>
      <div class="skeleton-extensions">
        <div class="skeleton-item"></div>
        <div class="skeleton-item"></div>
        <div class="skeleton-item"></div>
      </div>
    </div>
  `.repeat(3);
}

export {
  sanitizeHTML,
  sanitizeImageURL,
  throttle,
  debounce,
  showNotification,
  validateGroupName,
  createSkeletonLoader
};