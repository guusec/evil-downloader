// Popup script for Page Assets Downloader
(() => {
  'use strict';

  // DOM elements
  const downloadBtn = document.getElementById('downloadBtn');
  const statusDiv = document.getElementById('status');
  const fileCountDiv = document.getElementById('fileCount');
  const prettifyJsCheckbox = document.getElementById('prettifyJs');
  const includeInlineCheckbox = document.getElementById('includeInline');

  // Utility functions
  const ui = {
    showStatus(message, type = 'info') {
      statusDiv.textContent = message;
      statusDiv.className = `status ${type}`;
      statusDiv.style.display = 'block';
    },

    hideStatus() {
      statusDiv.style.display = 'none';
    },

    showFileCount(count) {
      if (count > 0) {
        fileCountDiv.textContent = `Found ${count} file${count === 1 ? '' : 's'} to download`;
        fileCountDiv.style.display = 'block';
      } else {
        fileCountDiv.style.display = 'none';
      }
    },

    setDownloadButtonState(enabled, text = '📥 Download Assets') {
      downloadBtn.disabled = !enabled;
      downloadBtn.textContent = text;
    }
  };

  // Main download process
  const downloader = {
    async getCurrentTab() {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      return tab;
    },

    async scanPageAssets() {
      const tab = await this.getCurrentTab();
      
      const options = {
        includeInline: includeInlineCheckbox.checked,
        prettifyJs: prettifyJsCheckbox.checked
      };

      return new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(tab.id, {
          action: 'scanAssets',
          options: options
        }, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          
          if (response && response.success) {
            resolve(response.assets);
          } else {
            reject(new Error(response?.error || 'Failed to scan assets'));
          }
        });
      });
    },

    async downloadAssets(assets) {
      const options = {
        prettifyJs: prettifyJsCheckbox.checked,
        includeInline: includeInlineCheckbox.checked
      };

      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          action: 'downloadAssets',
          assets: assets,
          options: options
        }, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          
          if (response && response.success) {
            resolve(response);
          } else {
            reject(new Error(response?.error || 'Download failed'));
          }
        });
      });
    },

    async processDownload() {
      try {
        ui.setDownloadButtonState(false, '🔍 Scanning...');
        ui.hideStatus();

        // Scan for assets
        const assets = await this.scanPageAssets();
        
        if (!assets || assets.length === 0) {
          ui.showStatus('No downloadable assets found on this page', 'error');
          ui.setDownloadButtonState(true);
          return;
        }

        ui.showFileCount(assets.length);
        ui.setDownloadButtonState(false, '📥 Downloading...');
        
        // Start downloads
        const result = await this.downloadAssets(assets);
        
        // Show results
        const { summary } = result;
        if (summary.failed === 0) {
          ui.showStatus(`Successfully downloaded ${summary.successful} file${summary.successful === 1 ? '' : 's'}!`, 'success');
        } else {
          ui.showStatus(`Downloaded ${summary.successful}/${summary.total} files (${summary.failed} failed)`, 'error');
        }

      } catch (error) {
        console.error('Download process failed:', error);
        ui.showStatus(`Error: ${error.message}`, 'error');
      } finally {
        ui.setDownloadButtonState(true);
      }
    }
  };

  // Event listeners
  downloadBtn.addEventListener('click', () => {
    downloader.processDownload();
  });

  // Save options to storage
  const saveOptions = () => {
    chrome.storage.sync.set({
      prettifyJs: prettifyJsCheckbox.checked,
      includeInline: includeInlineCheckbox.checked
    });
  };

  prettifyJsCheckbox.addEventListener('change', saveOptions);
  includeInlineCheckbox.addEventListener('change', saveOptions);

  // Load saved options
  const loadOptions = () => {
    chrome.storage.sync.get({
      prettifyJs: true,
      includeInline: true
    }, (items) => {
      prettifyJsCheckbox.checked = items.prettifyJs;
      includeInlineCheckbox.checked = items.includeInline;
    });
  };

  // Initialize
  document.addEventListener('DOMContentLoaded', () => {
    loadOptions();
    
    // Check if we can access the current tab
    downloader.getCurrentTab()
      .then(tab => {
        if (!tab || (!tab.url.startsWith('http') && !tab.url.startsWith('https'))) {
          ui.showStatus('Extension only works on web pages (http/https)', 'error');
          ui.setDownloadButtonState(false);
        }
      })
      .catch(error => {
        ui.showStatus('Unable to access current tab', 'error');
        ui.setDownloadButtonState(false);
      });
  });

  // Handle keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !downloadBtn.disabled) {
      downloader.processDownload();
    }
  });

  console.log('Page Assets Downloader popup script loaded');
})();
