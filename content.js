// Content script for scanning page assets
(() => {
  'use strict';

  // Utility functions
  const utils = {
    // Sanitize filename for downloads
    sanitizeFilename(filename) {
      return filename
        .replace(/[^\w\s.-]/gi, "_")
        .replace(/\s+/g, "_")
        .replace(/_+/g, "_")
        .substring(0, 200); // Limit filename length
    },

    // Extract filename from URL
    getFilenameFromUrl(url) {
      try {
        const urlObj = new URL(url);
        let filename = urlObj.pathname.split('/').pop();
        if (!filename || filename === '') {
          filename = urlObj.hostname + '_index';
        }
        return filename;
      } catch {
        return 'unknown_file';
      }
    },

    // Fetch file content with error handling
    async fetchFileContent(url) {
      try {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return await response.text();
      } catch (error) {
        console.warn(`Failed to fetch ${url}:`, error.message);
        return null;
      }
    }
  };

  // Scanner functions
  const scanner = {
    // Get all external JavaScript files
    getExternalScripts() {
      const scripts = [];
      document.querySelectorAll('script[src]').forEach(script => {
        const src = script.src;
        if (src && (src.startsWith('http') || src.startsWith('//'))) {
          const filename = utils.getFilenameFromUrl(src);
          scripts.push({
            url: src,
            filename: filename.endsWith('.js') ? filename : filename + '.js',
            type: 'external-js'
          });
        }
      });
      return scripts;
    },

    // Get all inline scripts
    getInlineScripts() {
      const scripts = [];
      document.querySelectorAll('script:not([src])').forEach((script, index) => {
        if (script.textContent && script.textContent.trim()) {
          scripts.push({
            content: script.textContent,
            filename: `inline_script_${index + 1}.js`,
            type: 'inline-js'
          });
        }
      });
      return scripts;
    },

    // Get current page HTML
    getCurrentPageHtml() {
      const url = window.location.href;
      const filename = utils.getFilenameFromUrl(url) + '.html';
      
      return {
        content: document.documentElement.outerHTML,
        filename: utils.sanitizeFilename(filename),
        type: 'html',
        url: url
      };
    },

    // Get iframe HTML sources
    getIframeHtml() {
      const iframes = [];
      document.querySelectorAll('iframe[src]').forEach((iframe, index) => {
        const src = iframe.src;
        if (src && (src.startsWith('http') || src.startsWith('//'))) {
          let filename = utils.getFilenameFromUrl(src);
          if (!filename.endsWith('.html')) {
            filename += '.html';
          }
          iframes.push({
            url: src,
            filename: filename,
            type: 'iframe-html'
          });
        }
      });
      return iframes;
    },

    // Scan all assets
    async scanAllAssets(options = {}) {
      const assets = [];
      
      // Add current page HTML
      assets.push(scanner.getCurrentPageHtml());
      
      // Add external scripts
      const externalScripts = scanner.getExternalScripts();
      assets.push(...externalScripts);
      
      // Add inline scripts if requested
      if (options.includeInline) {
        const inlineScripts = scanner.getInlineScripts();
        assets.push(...inlineScripts);
      }
      
      // Add iframe HTML
      const iframes = scanner.getIframeHtml();
      assets.push(...iframes);
      
      return assets;
    }
  };

  // Message listener for communication with popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'scanAssets') {
      scanner.scanAllAssets(request.options)
        .then(assets => {
          sendResponse({ success: true, assets });
        })
        .catch(error => {
          sendResponse({ success: false, error: error.message });
        });
      
      // Keep the message channel open for async response
      return true;
    }
    
    if (request.action === 'fetchContent') {
      utils.fetchFileContent(request.url)
        .then(content => {
          sendResponse({ success: true, content });
        })
        .catch(error => {
          sendResponse({ success: false, error: error.message });
        });
      
      return true;
    }
  });

  // Log that content script is loaded
  console.log('Page Assets Downloader content script loaded');
})();
