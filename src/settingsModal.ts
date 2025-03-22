import { invoke } from '@tauri-apps/api/core';
import { Main } from './main';
import { SidebarIcon } from './sidebar';
/**
 * This file contains the functions for the settings modal.
 */ 

export class SettingsModal {
  private modal: HTMLElement;
  private closeBtn: HTMLElement;
  private tabButtons: NodeListOf<HTMLElement>;
  private tabContents: NodeListOf<HTMLElement>;
  private restoreDefaultsBtn: HTMLButtonElement;
  private cancelSettingsBtn: HTMLButtonElement;
  private saveSettingsBtn: HTMLButtonElement;
  private gamePathsContainer: HTMLElement;

  private checkUpdatesToggle: HTMLInputElement;
  private checkSchemaUpdatesToggle: HTMLInputElement;
  private checkSqlUpdatesToggle: HTMLInputElement;
  private languageSelect: HTMLSelectElement;
  private dateFormatSelect: HTMLSelectElement;
  private defaultGameSelect: HTMLSelectElement;


  constructor() {
    this.modal = document.getElementById('settings-modal') as HTMLElement;
    this.closeBtn = document.querySelector('.close-btn') as HTMLElement;
    this.tabButtons = document.querySelectorAll('.tab-btn') as NodeListOf<HTMLElement>;
    this.tabContents = document.querySelectorAll('.tab-content') as NodeListOf<HTMLElement>;
    this.restoreDefaultsBtn = document.getElementById('restore-defaults') as HTMLButtonElement;
    this.cancelSettingsBtn = document.getElementById('cancel-settings') as HTMLButtonElement;
    this.saveSettingsBtn = document.getElementById('save-settings') as HTMLButtonElement;
    this.gamePathsContainer = document.getElementById('game-paths-container') as HTMLElement;

    // Default values for checkboxes
    this.checkUpdatesToggle = document.getElementById('check-updates-toggle') as HTMLInputElement;    
    this.checkSchemaUpdatesToggle = document.getElementById('check-schema-updates-toggle') as HTMLInputElement;
    this.checkSqlUpdatesToggle = document.getElementById('check-sql-updates-toggle') as HTMLInputElement;
    this.languageSelect = document.getElementById('language-select') as HTMLSelectElement;
    this.dateFormatSelect = document.getElementById('date-format-select') as HTMLSelectElement;
    this.defaultGameSelect = document.getElementById('default-game-select') as HTMLSelectElement;
  }

  /**
   * Open the settings modal dialog and populates it with the current settings.
   * @param {Main} main - The main instance of the application.
   */ 
  public openSettingsModal(main: Main) {
    this.closeBtn.addEventListener('click', this.closeSettingsModal);

    this.tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const tabId = btn.getAttribute('data-tab');
        if (tabId) {
          this.switchTab(tabId);
        }
      });
    });

    this.loadSettingsToModal(main);
     
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
   * Load the available games for the settings modal.
   * @param {Main} main - The main instance of the application.
   */ 
  async loadAvailableGames(main: Main) {
    try {
      const icons = await invoke("get_sidebar_icons") as SidebarIcon[];
      this.defaultGameSelect.innerHTML = '';
      icons.forEach(icon => {
        const option = document.createElement('option');
        option.value = icon.id;
        option.textContent = icon.name;
        this.defaultGameSelect.appendChild(option);
      });
      
      // Set current value from settings
      this.defaultGameSelect.value = main.settingsManager.appSettings.default_game;
    } catch (error) {
      console.error('Failed to load available games:', error);
    }
  }

  /**
   * Load the settings from the settings to the modal.
   * @param {Main} main - The main instance of the application.
   */ 
  public loadSettingsToModal(main: Main) {
    this.checkUpdatesToggle.checked = main.settingsManager.appSettings.check_updates_on_start;    
    this.checkSchemaUpdatesToggle.checked = main.settingsManager.appSettings.check_schema_updates_on_start;
    this.checkSqlUpdatesToggle.checked = main.settingsManager.appSettings.check_sql_scripts_updates_on_start;
    
    // Load dropdown values
    this.loadAvailableLanguages(main);
    this.loadAvailableDateFormats(main);
    this.loadAvailableGames(main);
    
    // Load game paths for the paths tab
    this.loadGamePaths(main);
  }

  /**
   * Save the settings from the modal.
   * @param {Main} main - The main instance of the application.
   */ 
  public getSettingsFromModal(main: Main) {
    main.settingsManager.appSettings.check_updates_on_start = this.checkUpdatesToggle.checked;
    main.settingsManager.appSettings.check_schema_updates_on_start = this.checkSchemaUpdatesToggle.checked;
    main.settingsManager.appSettings.check_sql_scripts_updates_on_start = this.checkSqlUpdatesToggle.checked;
    main.settingsManager.appSettings.language = this.languageSelect.value;
    main.settingsManager.appSettings.date_format = this.dateFormatSelect.value;
    main.settingsManager.appSettings.default_game = this.defaultGameSelect.value;
    
    this.getGamePathsFromModal(main);
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
        const pathItem = document.createElement('div');
        pathItem.className = 'game-path-item';
        
        const currentPath = main.settingsManager.appSettings.paths[icon.id] || '';
        const isLocked = main.settingsManager.appSettings.paths[`${icon.id}_locked`] === 'true';
        
        // Create the path row with label, input and browse button
        const pathRow = document.createElement('div');
        pathRow.className = 'path-row';
        
        const label = document.createElement('div');
        label.className = 'path-label';
        label.textContent = icon.name;
        
        const inputContainer = document.createElement('div');
        inputContainer.className = 'path-input-container';
        
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'path-input';
        input.value = currentPath;
        input.id = `path-input-${icon.id}`;
        input.disabled = isLocked;
        
        const browseBtn = document.createElement('button');
        browseBtn.className = 'path-browse-btn';
        browseBtn.innerHTML = '<i class="fa-solid fa-folder-open"></i>';
        browseBtn.title = 'Browse';
        browseBtn.disabled = isLocked;
        browseBtn.addEventListener('click', () => this.openFolderDialog(icon.id));
        
        const lockContainer = document.createElement('div');
        lockContainer.className = 'lock-container';
        
        const lockCheckbox = document.createElement('input');
        lockCheckbox.type = 'checkbox';
        lockCheckbox.className = 'lock-checkbox';
        lockCheckbox.id = `lock-checkbox-${icon.id}`;
        lockCheckbox.checked = isLocked;
        
        const lockLabel = document.createElement('label');
        lockLabel.className = 'lock-label';
        lockLabel.textContent = 'Updates Locked';
        lockLabel.htmlFor = `lock-checkbox-${icon.id}`;
        
        lockContainer.appendChild(lockCheckbox);
        lockContainer.appendChild(lockLabel);
        
        inputContainer.appendChild(input);
        inputContainer.appendChild(browseBtn);
        inputContainer.appendChild(lockContainer);
        
        pathRow.appendChild(label);
        pathRow.appendChild(inputContainer);
        
        pathItem.appendChild(pathRow);
        
        this.gamePathsContainer.appendChild(pathItem);
      }
    } catch (error) {
      console.error('Failed to load game paths:', error);
    }
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

  /**
   * Get the game paths from the modal.
   * @param {Main} main - The main instance of the application.
   */ 
  public getGamePathsFromModal(main: Main) {
    const pathItems = this.gamePathsContainer.querySelectorAll('.game-path-item');    
    pathItems.forEach((item) => {
      const input = item.querySelector('.path-input') as HTMLInputElement;
      if (!input) return;
      
      const gameId = input.id.replace('path-input-', '');
      const checkbox = item.querySelector(`#lock-checkbox-${gameId}`) as HTMLInputElement;
      main.settingsManager.appSettings.paths[gameId] = input.value;
      
      // TODO: Properly check the read-only state of the lock file.
      if (checkbox) {
        main.settingsManager.appSettings.paths[`${gameId}_locked`] = checkbox.checked ? 'true' : 'false';
      }
    });
  }
}
