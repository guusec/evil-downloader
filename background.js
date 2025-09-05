// Background service worker for Page Assets Downloader
(() => {
  'use strict';

  // Import js-beautify library with cross-browser compatibility
  let jsBeautifyLoaded = false;
  
  // Try importScripts first (Chrome)
  if (typeof importScripts !== 'undefined') {
    try {
      importScripts('js-beautify.min.js');
      jsBeautifyLoaded = true;
      console.log('js-beautify loaded via importScripts');
    } catch (error) {
      console.warn('Failed to import js-beautify via importScripts:', error);
    }
  }
  
  // Firefox fallback: dynamically load js-beautify
  if (!jsBeautifyLoaded) {
    console.log('Loading js-beautify dynamically for Firefox...');
    fetch(chrome.runtime.getURL('js-beautify.min.js'))
      .then(response => response.text())
      .then(code => {
        // Execute the js-beautify code in global scope
        eval(code);
        jsBeautifyLoaded = true;
        console.log('js-beautify loaded dynamically');
      })
      .catch(error => {
        console.warn('Failed to load js-beautify dynamically:', error);
      });
  }

  // JS Beautifier wrapper using the imported library
  const jsBeautify = {
    // Check if js_beautify is available
    isAvailable() {
      return typeof js_beautify !== 'undefined' && jsBeautifyLoaded;
    },

    // Basic fallback beautifier for cross-browser compatibility
    basicBeautify(code) {
      try {
        // Basic prettification - add proper indentation and line breaks
        let formatted = code
          // Add line breaks after semicolons and braces
          .replace(/;/g, ';\n')
          .replace(/\{/g, '{\n')
          .replace(/\}/g, '\n}\n')
          // Add line breaks after commas in function parameters and arrays
          .replace(/,(\s*[a-zA-Z_$])/g, ',\n$1')
          // Clean up multiple newlines
          .replace(/\n\s*\n/g, '\n')
          .replace(/\n{3,}/g, '\n\n');

        // Add basic indentation
        const lines = formatted.split('\n');
        let indentLevel = 0;
        const indentString = '  '; // 2 spaces

        const indentedLines = lines.map(line => {
          const trimmed = line.trim();
          if (!trimmed) return '';

          // Decrease indent for closing braces
          if (trimmed.includes('}')) {
            indentLevel = Math.max(0, indentLevel - 1);
          }

          const indentedLine = indentString.repeat(indentLevel) + trimmed;

          // Increase indent for opening braces
          if (trimmed.includes('{')) {
            indentLevel++;
          }

          return indentedLine;
        });

        return indentedLines.join('\n');
      } catch (error) {
        console.warn('Error with basic beautification:', error);
        return code;
      }
    },

    beautify(code) {
      try {
        // Use the imported js_beautify function if available
        if (this.isAvailable()) {
          return js_beautify(code, {
            indent_size: 2,
            indent_char: ' ',
            max_preserve_newlines: 2,
            preserve_newlines: true,
            keep_array_indentation: false,
            break_chained_methods: false,
            indent_scripts: 'normal',
            brace_style: 'collapse',
            space_before_conditional: true,
            unescape_strings: false,
            jslint_happy: false,
            end_with_newline: true,
            wrap_line_length: 120,
            comma_first: false
          });
        } else {
          // Fall back to basic beautification
          console.info('Using basic beautification fallback');
          return this.basicBeautify(code);
        }
      } catch (error) {
        console.warn('Error beautifying JavaScript:', error);
        // Final fallback to original code if all beautification fails
        return code;
      }
    }
  };

  // Download manager
  const downloadManager = {
    // Create a download URL for text content (cross-browser compatible)
    createDownloadUrl(content, mimeType = 'text/plain') {
      try {
        // Try to use Blob URLs first (preferred for Firefox)
        const blob = new Blob([content], { type: mimeType });
        return URL.createObjectURL(blob);
      } catch (error) {
        console.warn('Blob URL creation failed, falling back to data URL:', error);
        // Fallback to data URL for Chrome/other browsers
        const base64 = btoa(unescape(encodeURIComponent(content)));
        return `data:${mimeType};base64,${base64}`;
      }
    },

    // Fetch external file content
    async fetchExternalContent(url) {
      try {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return await response.text();
      } catch (error) {
        console.warn(`Failed to fetch external content from ${url}:`, error.message);
        return null;
      }
    },

    // Download a single file to evil-downloads subfolder
    async downloadFile(asset, options = {}) {
      try {
        let content;
        let url;

        if (asset.content) {
          // File has content already (inline scripts, HTML)
          content = asset.content;
          
          // Prettify JavaScript if requested
          if (options.prettifyJs && asset.type.includes('js')) {
            content = jsBeautify.beautify(content);
          }

          url = this.createDownloadUrl(content, this.getMimeType(asset.type));
        } else if (asset.url) {
          // External file - fetch content if it's JS and beautification is requested
          if (options.prettifyJs && asset.type.includes('js')) {
            content = await this.fetchExternalContent(asset.url);
            if (content) {
              // Beautify the fetched JavaScript content
              content = jsBeautify.beautify(content);
              url = this.createDownloadUrl(content, this.getMimeType(asset.type));
            } else {
              // Fallback to direct download if fetch fails
              url = asset.url;
            }
          } else {
            // For non-JS files or when beautification is disabled, download directly
            url = asset.url;
          }
        } else {
          throw new Error('Asset has no content or URL');
        }

        // Download to evil-downloads subfolder in Downloads directory
        const filename = `evil-downloads/${asset.filename}`;
        
        console.log('Downloading to:', filename);
        
        // Build download options with explicit settings to prevent dialog
        const downloadOptions = {
          url: url,
          filename: filename,
          saveAs: false, // Explicitly disable file dialog
          conflictAction: 'uniquify' // Auto-rename if file exists
        };
        
        // Remove undefined/null properties that might interfere
        Object.keys(downloadOptions).forEach(key => {
          if (downloadOptions[key] === undefined || downloadOptions[key] === null) {
            delete downloadOptions[key];
          }
        });

        console.log('Download options:', downloadOptions);
        
        const downloadId = await chrome.downloads.download(downloadOptions);
        
        console.log('Download started with ID:', downloadId);
        
        // Clean up blob URL if it was created (to prevent memory leaks)
        if (url.startsWith('blob:')) {
          setTimeout(() => {
            try {
              URL.revokeObjectURL(url);
              console.log('Cleaned up blob URL');
            } catch (error) {
              console.warn('Failed to clean up blob URL:', error);
            }
          }, 5000); // Wait 5 seconds before cleanup
        }
        
        // Wait a moment then check the actual download path
        setTimeout(async () => {
          try {
            const items = await chrome.downloads.search({ id: downloadId });
            if (items.length > 0) {
              console.log('Actual download path:', items[0].filename);
              console.log('Download state:', items[0].state);
            }
          } catch (error) {
            console.warn('Could not check download path:', error);
          }
        }, 1000);
        
        return { success: true, downloadId, filename: asset.filename };
      } catch (error) {
        console.error('Download failed:', error);
        return { success: false, error: error.message, filename: asset.filename };
      }
    },

    // Download multiple files to evil-downloads subfolder
    async downloadFiles(assets, options = {}) {
      if (assets.length === 0) {
        return [];
      }

      const results = [];
      
      // Download all files to ~/Downloads/evil-downloads/
      for (const asset of assets) {
        const result = await this.downloadFile(asset, options);
        results.push(result);
        
        // Small delay between downloads to avoid overwhelming the browser
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      
      return results;
    },

    // Get MIME type for different asset types
    getMimeType(type) {
      switch (type) {
        case 'html':
        case 'iframe-html':
          return 'text/html';
        case 'external-js':
        case 'inline-js':
          return 'application/javascript';
        default:
          return 'text/plain';
      }
    }
  };

  // Message listener for communication with popup and content scripts
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'downloadAssets') {
      downloadManager.downloadFiles(request.assets, request.options)
        .then(results => {
          const successCount = results.filter(r => r.success).length;
          const failureCount = results.filter(r => !r.success).length;
          
          sendResponse({
            success: true,
            results,
            summary: {
              total: results.length,
              successful: successCount,
              failed: failureCount
            }
          });
        })
        .catch(error => {
          sendResponse({
            success: false,
            error: error.message
          });
        });
      
      // Keep the message channel open for async response
      return true;
    }

    if (request.action === 'beautifyJs') {
      try {
        const beautified = jsBeautify.beautify(request.code);
        sendResponse({ success: true, code: beautified });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    }
  });

  // Log that background script is loaded
  console.log('Page Assets Downloader background script loaded');
})();
