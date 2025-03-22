import { invoke } from '@tauri-apps/api/core';
import { Main } from './main';

/**
 * This file contains the functions for the settings modal.
 */ 

export class SettingsModal {
  private modal: HTMLElement;
  private closeBtn: HTMLElement;
  private tabButtons: NodeListOf<HTMLElement>;
  private tabContents: NodeListOf<HTMLElement>;
  private restoreDefaultsBtn: HTMLElement;
  private cancelSettingsBtn: HTMLElement;
  private saveSettingsBtn: HTMLElement;

  constructor() {
    this.modal = document.getElementById('settings-modal');
    this.closeBtn = document.querySelector('.close-btn');
    this.tabButtons = document.querySelectorAll('.tab-btn');
    this.tabContents = document.querySelectorAll('.tab-content');
    this.restoreDefaultsBtn = document.getElementById('restore-defaults');
    this.cancelSettingsBtn = document.getElementById('cancel-settings');
    this.saveSettingsBtn = document.getElementById('save-settings');
  }

  /**
   * Open the settings modal dialog and populates it with the current settings.
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
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.remove('active');
      if (btn.getAttribute('data-tab') === tabId) {
        btn.classList.add('active');
      }
    });

    // Update tab contents
    document.querySelectorAll('.tab-content').forEach(content => {
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
    // Default values for checkboxes
    const checkUpdatesToggle = document.getElementById('check-updates-toggle') as HTMLInputElement;
    if (checkUpdatesToggle) {
      checkUpdatesToggle.checked = true;
    }
    
    const checkSchemaUpdatesToggle = document.getElementById('check-schema-updates-toggle') as HTMLInputElement;
    if (checkSchemaUpdatesToggle) {
      checkSchemaUpdatesToggle.checked = true;
    }
    
    const checkSqlUpdatesToggle = document.getElementById('check-sql-updates-toggle') as HTMLInputElement;
    if (checkSqlUpdatesToggle) {
      checkSqlUpdatesToggle.checked = true;
    }
    
    // Default values for dropdowns
    const languageSelect = document.getElementById('language-select') as HTMLSelectElement;
    if (languageSelect) {
      languageSelect.value = 'English';
    }
    
    const dateFormatSelect = document.getElementById('date-format-select') as HTMLSelectElement;
    if (dateFormatSelect) {
      dateFormatSelect.value = 'DD/MM/YYYY';
    }
    
    const defaultGameSelect = document.getElementById('default-game-select') as HTMLSelectElement;
    if (defaultGameSelect) {
      // Set to first option as default
      if (defaultGameSelect.options.length > 0) {
        defaultGameSelect.selectedIndex = 0;
      }
    }
    
    // Default values for other inputs
    const cacheInput = document.querySelector('#advanced-tab input[type="number"]') as HTMLInputElement;
    if (cacheInput) cacheInput.value = '1024';

    const logSelect = document.querySelector('#advanced-tab select:last-child') as HTMLSelectElement;
    if (logSelect) logSelect.value = 'info';
  }

  /**
   * Save the settings from the settings modal.
   */ 
  saveSettingsModal(main: Main) {
    this.getSettingsFromModal(main);
    main.settingsManager.saveSettings();
    this.closeSettingsModal();
  }

  /**
   * Load the available languages for the settings modal.
   */ 
  async loadAvailableLanguages(main: Main) {
    try {
      const languages = await invoke('get_available_languages') as string[];
      const languageSelect = document.getElementById('language-select') as HTMLSelectElement;
      
      if (languageSelect) {
        languageSelect.innerHTML = '';
        languages.forEach(language => {
          const option = document.createElement('option');
          option.value = language;
          option.textContent = language;
          languageSelect.appendChild(option);
        });
        
        // Set current value from settings
        languageSelect.value = main.settingsManager.appSettings.language;
      }
    } catch (error) {
      console.error('Failed to load available languages:', error);
    }
  }

  /**
   * Load the available date formats for the settings modal.
   */ 
  async loadAvailableDateFormats(main: Main) {
    try {
      const dateFormats = await invoke('get_available_date_formats') as string[];
      const dateFormatSelect = document.getElementById('date-format-select') as HTMLSelectElement;
      
      if (dateFormatSelect) {
        dateFormatSelect.innerHTML = '';
        dateFormats.forEach(format => {
          const option = document.createElement('option');
          option.value = format;
          option.textContent = format;
          dateFormatSelect.appendChild(option);
        });
        
        // Set current value from settings
        dateFormatSelect.value = main.settingsManager.appSettings.date_format;
      }
    } catch (error) {
      console.error('Failed to load available date formats:', error);
    }
  }

  /**
   * Load the available games for the settings modal.
   */ 
  async loadAvailableGames(main: Main) {
    try {
      const icons = await invoke("get_sidebar_icons") as SidebarIcon[];
      const defaultGameSelect = document.getElementById('default-game-select') as HTMLSelectElement;
      
      if (defaultGameSelect) {
        defaultGameSelect.innerHTML = '';
        icons.forEach(icon => {
          const option = document.createElement('option');
          option.value = icon.id;
          option.textContent = icon.name;
          defaultGameSelect.appendChild(option);
        });
        
        // Set current value from settings
        defaultGameSelect.value = main.settingsManager.appSettings.default_game;
      }
    } catch (error) {
      console.error('Failed to load available games:', error);
    }
  }

  /**
   * Load the settings from the settings to the modal.
   */ 
  public loadSettingsToModal(main: Main) {
    // Load checkbox values
    const checkUpdatesToggle = document.getElementById('check-updates-toggle') as HTMLInputElement;
    if (checkUpdatesToggle) {
      checkUpdatesToggle.checked = main.settingsManager.appSettings.check_updates_on_start;
    }
    
    const checkSchemaUpdatesToggle = document.getElementById('check-schema-updates-toggle') as HTMLInputElement;
    if (checkSchemaUpdatesToggle) {
      checkSchemaUpdatesToggle.checked = main.settingsManager.appSettings.check_schema_updates_on_start;
    }
    
    const checkSqlUpdatesToggle = document.getElementById('check-sql-updates-toggle') as HTMLInputElement;
    if (checkSqlUpdatesToggle) {
      checkSqlUpdatesToggle.checked = main.settingsManager.appSettings.check_sql_scripts_updates_on_start;
    }
    
    // Load dropdown values
    this.loadAvailableLanguages(main);
    this.loadAvailableDateFormats(main);
    this.loadAvailableGames(main);
    
    // Load game paths for the paths tab
    this.loadGamePaths(main);
  }

  /**
   * Save the settings from the modal.
   */ 
  public getSettingsFromModal(main: Main) {
    // Get checkbox values
    const checkUpdatesToggle = document.getElementById('check-updates-toggle') as HTMLInputElement;
    if (checkUpdatesToggle) {
      main.settingsManager.appSettings.check_updates_on_start = checkUpdatesToggle.checked;
    }
    
    const checkSchemaUpdatesToggle = document.getElementById('check-schema-updates-toggle') as HTMLInputElement;
    if (checkSchemaUpdatesToggle) {
      main.settingsManager.appSettings.check_schema_updates_on_start = checkSchemaUpdatesToggle.checked;
    }
    
    const checkSqlUpdatesToggle = document.getElementById('check-sql-updates-toggle') as HTMLInputElement;
    if (checkSqlUpdatesToggle) {
      main.settingsManager.appSettings.check_sql_scripts_updates_on_start = checkSqlUpdatesToggle.checked;
    }
    
    // Get dropdown values
    const languageSelect = document.getElementById('language-select') as HTMLSelectElement;
    if (languageSelect) {
      main.settingsManager.appSettings.language = languageSelect.value;
    }
    
    const dateFormatSelect = document.getElementById('date-format-select') as HTMLSelectElement;
    if (dateFormatSelect) {
      main.settingsManager.appSettings.date_format = dateFormatSelect.value;
    }
    
    const defaultGameSelect = document.getElementById('default-game-select') as HTMLSelectElement;
    if (defaultGameSelect) {
      main.settingsManager.appSettings.default_game = defaultGameSelect.value;
    }
    
    // Get game paths
    this.getGamePathsFromModal(main);
  }

  /**
   * Load the game paths for the settings modal.
   */ 
  public async loadGamePaths(main: Main) {
    try {
      const icons = await invoke("get_sidebar_icons") as SidebarIcon[];
      const gamePathsContainer = document.getElementById('game-paths-container');
      
      if (gamePathsContainer) {
        gamePathsContainer.innerHTML = '';
        
        for (const icon of icons) {
          const pathItem = document.createElement('div');
          pathItem.className = 'game-path-item';
          
          // Current path value from settings (or empty string if not set)
          const currentPath = main.settingsManager.appSettings.paths[icon.id] || '';
          // Locked state (default to false if not set)
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
          
          // Create the lock checkbox container
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
          
          // Add event listener to toggle input and button disabled state
          lockCheckbox.addEventListener('change', (e) => {
            const isChecked = (e.target as HTMLInputElement).checked;
            input.disabled = isChecked;
            browseBtn.disabled = isChecked;
          });
          
          // Agregar componentes al contenedor de checkbox
          lockContainer.appendChild(lockCheckbox);
          lockContainer.appendChild(lockLabel);
          
          // Agregar componentes al contenedor de inputs
          inputContainer.appendChild(input);
          inputContainer.appendChild(browseBtn);
          inputContainer.appendChild(lockContainer);
          
          // Agregar componentes a la fila
          pathRow.appendChild(label);
          pathRow.appendChild(inputContainer);
          
          // Agregar la fila al elemento de path
          pathItem.appendChild(pathRow);
          
          // Add to the container
          gamePathsContainer.appendChild(pathItem);
        }
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
      // Obtener la ruta actual del campo de texto
      const input = document.getElementById(`path-input-${gameId}`) as HTMLInputElement;
      const currentPath = input ? input.value : '';

      // Llamar a la función Rust con la ruta actual
      const result = await invoke('browse_folder', { 
        title: 'Select Game Directory',
        currentPath: currentPath
      });
      
      // Actualizar el campo de entrada con la ruta seleccionada
      if (input && result) {
        input.value = result as string;
      }
    } catch (error) {
      console.error('Failed to open folder dialog:', error);
      
      // Mostrar un mensaje al usuario indicando que debe introducir la ruta manualmente
      const input = document.getElementById(`path-input-${gameId}`) as HTMLInputElement;
      if (input) {
        input.focus();
        // Si hay un mensaje específico del error, mostrarlo
        if (typeof error === 'string') {
          alert(error);
        } else {
          alert('Please enter the path manually. The folder selection dialog could not be opened.');
        }
      }
    }
  }

  /**
   * Get the game paths from the modal.
   */ 
  public getGamePathsFromModal(main: Main) {
    // Get sidebar icons
    const gamePathsContainer = document.getElementById('game-paths-container');
    if (!gamePathsContainer) return;
    
    // Get all path items
    const pathItems = gamePathsContainer.querySelectorAll('.game-path-item');
    
    pathItems.forEach((item) => {
      // Get the game ID from the input ID
      const input = item.querySelector('.path-input') as HTMLInputElement;
      if (!input) return;
      
      const gameId = input.id.replace('path-input-', '');
      const checkbox = item.querySelector(`#lock-checkbox-${gameId}`) as HTMLInputElement;
      
      // Update the path in settings
      main.settingsManager.appSettings.paths[gameId] = input.value;
      
      // Update the locked state in settings
      if (checkbox) {
        main.settingsManager.appSettings.paths[`${gameId}_locked`] = checkbox.checked ? 'true' : 'false';
      }
    });
  }
}
