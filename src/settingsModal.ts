import { exit } from '@tauri-apps/plugin-process';
import { invoke } from '@tauri-apps/api/core';
import { Main } from './main';
import { SidebarIcon } from './sidebar';

/**
 * This file contains the functions for the settings modal.
 */ 

export class SettingsModal {
  private modal: HTMLElement;
  private tabButtons: NodeListOf<HTMLElement>;
  private tabContents: NodeListOf<HTMLElement>;
  private restoreDefaultsBtn: HTMLButtonElement;
  private cancelSettingsBtn: HTMLButtonElement;
  private saveSettingsBtn: HTMLButtonElement;
  private closeAppBtn: HTMLButtonElement;
  private gamePathsContainer: HTMLElement;
  private pathsMessage: HTMLElement;
  private gamePathTemplate: HTMLTemplateElement;

  private checkUpdatesToggle: HTMLInputElement;
  private checkSchemaUpdatesToggle: HTMLInputElement;
  private checkSqlUpdatesToggle: HTMLInputElement;
  private languageSelect: HTMLSelectElement;
  private dateFormatSelect: HTMLSelectElement;
  private defaultGameSelect: HTMLSelectElement;


  constructor() {
    this.modal = document.getElementById('settings-modal') as HTMLElement;
    this.tabButtons = document.querySelectorAll('.tab-btn') as NodeListOf<HTMLElement>;
    this.tabContents = document.querySelectorAll('.tab-content') as NodeListOf<HTMLElement>;
    this.restoreDefaultsBtn = document.getElementById('restore-defaults') as HTMLButtonElement;
    this.cancelSettingsBtn = document.getElementById('cancel-settings') as HTMLButtonElement;
    this.saveSettingsBtn = document.getElementById('save-settings') as HTMLButtonElement;
    this.closeAppBtn = document.getElementById('close-app') as HTMLButtonElement;
    this.gamePathsContainer = document.getElementById('game-paths-container') as HTMLElement;
    this.pathsMessage = document.getElementById('paths-message') as HTMLElement;
    this.gamePathTemplate = document.getElementById('game-path-template') as HTMLTemplateElement;

    // Default values for checkboxes
    this.checkUpdatesToggle = document.getElementById('check-updates-toggle') as HTMLInputElement;    
    this.checkSchemaUpdatesToggle = document.getElementById('check-schema-updates-toggle') as HTMLInputElement;
    this.checkSqlUpdatesToggle = document.getElementById('check-sql-updates-toggle') as HTMLInputElement;
    this.languageSelect = document.getElementById('language-select') as HTMLSelectElement;
    this.dateFormatSelect = document.getElementById('date-format-select') as HTMLSelectElement;
    this.defaultGameSelect = document.getElementById('default-game-select') as HTMLSelectElement;
  }

  /************************
   * Open/Close
   ************************/

  /**
   * Open the settings modal dialog and populates it with the current settings.
   * @param {Main} main - The main instance of the application.
   */ 
  public async openSettingsModal(main: Main) {
    this.tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const tabId = btn.getAttribute('data-tab');
        if (tabId) {
          this.switchTab(tabId);
        }
      });
    });

    await this.loadSettingsToModal(main);
     
    this.modal.classList.add('active');
    this.switchTab(this.tabButtons[0].dataset.tab || 'general');

    this.restoreDefaultsBtn.addEventListener('click', () => this.restoreDefaultSettings());
    this.cancelSettingsBtn.addEventListener('click', () => this.closeSettingsModal());
    this.saveSettingsBtn.addEventListener('click', () => this.saveSettingsModal(main));
  }

  /**
   * Close the settings modal dialog.
   */ 
  public closeSettingsModal() {
    this.modal.classList.remove('active');
  }

  /************************
   * Loading logic
   ************************/

  /**
   * Load the available languages for the settings modal.
   * @param {Main} main - The main instance of the application.
   */ 
  async loadAvailableLanguages(main: Main) {
    try {
      const languages = await invoke('get_available_languages') as string[];
      this.languageSelect.innerHTML = '';
      languages.forEach(language => {
        const option = document.createElement('option');
        option.value = language;
        option.textContent = language;
        this.languageSelect.appendChild(option);
      });
      
      // Set current value from settings
      this.languageSelect.value = main.settingsManager.appSettings.language;
    } catch (error) {
      console.error('Failed to load available languages:', error);
    }
  }

  /**
   * Load the available date formats for the settings modal.
   * @param {Main} main - The main instance of the application.
   */ 
  async loadAvailableDateFormats(main: Main) {
    try {
      const dateFormats = await invoke('get_available_date_formats') as string[];
      this.dateFormatSelect.innerHTML = '';
      dateFormats.forEach(format => {
        const option = document.createElement('option');
        option.value = format;
        option.textContent = format;
        this.dateFormatSelect.appendChild(option);
      });
      
      // Set current value from settings
      this.dateFormatSelect.value = main.settingsManager.appSettings.date_format;
    } catch (error) {
      console.error('Failed to load available date formats:', error);
    }
  }

  /**
   * Load the game paths for the settings modal.
   * @param {Main} main - The main instance of the application.
   */ 
  public async loadGamePaths(main: Main) {
    try {
      const icons = await invoke("get_sidebar_icons") as SidebarIcon[];
      this.gamePathsContainer.innerHTML = '';
      
      for (const icon of icons) {
        const clone = this.gamePathTemplate.content.cloneNode(true) as DocumentFragment;
        const pathItem = clone.querySelector('.game-path-item') as HTMLElement;
        const gameName = pathItem.querySelector('.game-name') as HTMLElement;
        const pathInput = pathItem.querySelector('.path-input') as HTMLInputElement;
        const browseBtn = pathItem.querySelector('.browse-btn') as HTMLButtonElement;
        const selectGameBtn = pathItem.querySelector('.select-game-btn') as HTMLButtonElement;
        const status = pathItem.querySelector('.input-status') as HTMLElement;
        const lockCheckbox = pathItem.querySelector('.lock-checkbox') as HTMLInputElement;
        const lockLabel = pathItem.querySelector('.lock-label') as HTMLLabelElement;
        
        lockCheckbox.id = `lock-checkbox-${icon.id}`;
        lockCheckbox.checked = main.settingsManager.appSettings.paths[`${icon.id}_locked`] === 'true';
        lockLabel.htmlFor = `lock-checkbox-${icon.id}`;
        pathInput.id = `path-input-${icon.id}`;
        gameName.textContent = icon.name;
        pathInput.value = main.settingsManager.appSettings.paths[icon.id] || '';
        selectGameBtn.disabled = !pathInput.value;
        
        // Enable/disable select game button based on input
        pathInput.addEventListener('input', () => {
          this.setPathStatus(icon.id);
        });
        
        // Browse button click handler
        browseBtn.addEventListener('click', () => {
          this.openFolderDialog(icon.id).then(() => {
            this.setPathStatus(icon.id);
          });
        });
        
        // Select game button click handler
        selectGameBtn.addEventListener('click', () => {
          this.undoNoGameMode();
          this.saveSettingsModal(main);
          this.closeSettingsModal();
          main.sidebar.updateSidebarIcons(main.settingsManager);
          main.sidebar.clickSidebarButton(icon.id);
        });

        // Set initial status. TODO: check for more than just a path.
        if (pathInput.value) {
          status.classList.add('ok');
        } else {
          status.classList.add('error');
        }
        
        this.gamePathsContainer.appendChild(pathItem);
      }
    } catch (error) {
      console.error('Failed to load game paths:', error);
    }
  }

  /**
   * Load the settings from the settings to the modal.
   * @param {Main} main - The main instance of the application.
   */ 
  public async loadSettingsToModal(main: Main) {
    this.checkUpdatesToggle.checked = main.settingsManager.appSettings.check_updates_on_start;    
    this.checkSchemaUpdatesToggle.checked = main.settingsManager.appSettings.check_schema_updates_on_start;
    this.checkSqlUpdatesToggle.checked = main.settingsManager.appSettings.check_sql_scripts_updates_on_start;
    
    // Load dropdown values
    this.loadAvailableLanguages(main);
    this.loadAvailableDateFormats(main);
    
    // Load game paths for the paths tab
    await this.loadGamePaths(main);
  }

  /************************
   * Saving logic
   ************************/
  
  /**
   * Get the game paths from the modal.
   * @param {Main} main - The main instance of the application.
   */ 
  getGamePathsFromModal(main: Main) {
    const pathItems = this.gamePathsContainer.querySelectorAll('.game-path-item');
    pathItems.forEach((item) => {
      const input = item.querySelector('.path-input') as HTMLInputElement;

      const gameId = input.id.replace('path-input-', '');
      main.settingsManager.appSettings.paths[gameId] = input.value;
    });
  }
  
  /**
   * Save the settings from the modal.
   * @param {Main} main - The main instance of the application.
   */ 
  getSettingsFromModal(main: Main) {
    main.settingsManager.appSettings.check_updates_on_start = this.checkUpdatesToggle.checked;
    main.settingsManager.appSettings.check_schema_updates_on_start = this.checkSchemaUpdatesToggle.checked;
    main.settingsManager.appSettings.check_sql_scripts_updates_on_start = this.checkSqlUpdatesToggle.checked;
    main.settingsManager.appSettings.language = this.languageSelect.value;
    main.settingsManager.appSettings.date_format = this.dateFormatSelect.value;
    
    this.getGamePathsFromModal(main);
  }

  /**
   * Save the settings from the settings modal.
   * @param {Main} main - The main instance of the application.
   */ 
  saveSettingsModal(main: Main) {
    this.getSettingsFromModal(main);
    main.settingsManager.saveSettings();
    this.closeSettingsModal();
  }
  
  /**
   * Restore the default settings.
   */ 
  public restoreDefaultSettings() {
    this.checkUpdatesToggle.checked = true;
    this.checkSchemaUpdatesToggle.checked = true;
    this.checkSqlUpdatesToggle.checked = true;
    this.languageSelect.value = 'English';
    this.dateFormatSelect.value = 'DD/MM/YYYY';
    
    // Set to first option as default
    if (this.defaultGameSelect.options.length > 0) {
      this.defaultGameSelect.selectedIndex = 0;
    }
    
    // Default values for other inputs
    const cacheInput = document.querySelector('#advanced-tab input[type="number"]') as HTMLInputElement;
    if (cacheInput) cacheInput.value = '1024';

    const logSelect = document.querySelector('#advanced-tab select:last-child') as HTMLSelectElement;
    if (logSelect) logSelect.value = 'info';
  }

  /************************
   * Tab switching
   ************************/

  /**
   * Switch the tab selected in the settings modal.
   * @param {string} tabId - The id of the tab to switch to.
   */ 
  switchTab(tabId: string) {
    // Update tab buttons
    this.tabButtons.forEach(btn => {
      btn.classList.remove('active');
      if (btn.getAttribute('data-tab') === tabId) {
        btn.classList.add('active');
      }
    });

    // Update tab contents
    this.tabContents.forEach(content => {
      content.classList.remove('active');
      if (content.id === `${tabId}-tab`) {
        content.classList.add('active');
      }
    });
  }

  /**
   * Open the folder dialog for selecting the game path.
   * @param {string} gameId - The id of the game.
   */ 
  public async openFolderDialog(gameId: string) {
    try {
      const input = document.getElementById(`path-input-${gameId}`) as HTMLInputElement;
      const currentPath = input ? input.value : '';
      const result = await invoke('browse_folder', { 
        title: 'Select Game Directory',
        currentPath: currentPath
      });
      
      // Update the input with the selected path.
      if (input && result) {
        input.value = result as string;
      }
    } catch (error) {
      console.error('Failed to open folder dialog:', error);
    }
  }

  /************************
   * No-Games behavior
   ************************/

  /**
   * Opens the modal in a special mode where the user can only fill the game paths or exist the app.
   * @param {Main} main - The main instance of the application.
   */ 
  public async openWithNoGameDetected(main: Main) {
    await this.openSettingsModal(main);
    this.switchTab("paths");
    this.showPathsMessage("Please configure the path for the game you want to play, and select it.");
    
    const modalTabs = this.modal.getElementsByClassName('modal-tabs')[0] as HTMLElement;
    modalTabs.classList.add('hidden');
    
    this.restoreDefaultsBtn.classList.add('hidden');
    this.cancelSettingsBtn.classList.add('hidden');
    this.saveSettingsBtn.classList.add('hidden');
    this.closeAppBtn.classList.remove('hidden');
    
    const selectGameBtn = this.gamePathsContainer.querySelectorAll('.select-game-btn');
    selectGameBtn.forEach((btn) => {
      btn.classList.remove('hidden');
    });
    
    // Close the app if we hit the close button, as we can't do anything without a game path.
    this.closeAppBtn.addEventListener('click', async () => {
      await exit(1);
    });
  }

  /**
   * Undo the changes done to the settings modal by the openWithNoGameDetected method.
   */
  public async undoNoGameMode() {
    this.switchTab("general");
    this.hidePathsMessage();

    const modalTabs = this.modal.getElementsByClassName('modal-tabs')[0] as HTMLElement;
    modalTabs.classList.remove('hidden');

    this.restoreDefaultsBtn.classList.remove('hidden');
    this.cancelSettingsBtn.classList.remove('hidden');
    this.saveSettingsBtn.classList.remove('hidden');
    this.closeAppBtn.classList.add('hidden');

    const selectGameBtn = this.gamePathsContainer.querySelectorAll('.select-game-btn');
    selectGameBtn.forEach((btn) => {
      btn.classList.add('hidden');
    });
  }

  /**
   * Show a message in the paths message area.
   * @param {string} message - The message to show.
   */
  public showPathsMessage(message: string) {
    this.pathsMessage.textContent = message;
    this.pathsMessage.classList.remove('hidden');
  }

  /**
   * Hide the paths message area.
   */
  public hidePathsMessage() {
    this.pathsMessage.textContent = '';
    this.pathsMessage.classList.add('hidden');
  }

  /**
   * Set the status of the game path.
   * @param {string} gameId - The id of the game.
   */
  public setPathStatus(gameId: string) {
    const gameInput = this.gamePathsContainer.querySelector(`#path-input-${gameId}`) as HTMLInputElement;
    const pathItem = gameInput.closest('.game-path-item') as HTMLElement;
    const statusItem = pathItem.querySelector('.input-status') as HTMLElement;
    const selectGameBtn = pathItem.querySelector('.select-game-btn') as HTMLButtonElement;

    const status = gameInput.value ? 'ok' : 'error';
    const statusOpposite = !gameInput.value ? 'ok' : 'error';

    statusItem.classList.add(status);
    statusItem.classList.remove(statusOpposite);

    selectGameBtn.disabled = !gameInput.value;
  }
}
