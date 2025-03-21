/**
 * This file contains the functions for the settings modal.
 */ 

/**
 * Open the settings modal dialog and populates it with the current settings.
 */ 
function openSettingsModal() {
  loadSettingsToModal();
  
  const modal = document.getElementById('settings-modal');
  if (modal) {
    modal.classList.add('active');

    const firstTabBtn = document.querySelector('.tab-btn') as HTMLButtonElement;
    if (firstTabBtn) {
      switchTab(firstTabBtn.dataset.tab || 'general');
    }
  }

  const restoreDefaultsBtn = document.getElementById('restore-defaults');
  if (restoreDefaultsBtn) {
    restoreDefaultsBtn.addEventListener('click', restoreDefaultSettings);
  }

  const cancelSettingsBtn = document.getElementById('cancel-settings');
  if (cancelSettingsBtn) {
    cancelSettingsBtn.addEventListener('click', closeSettingsModal);
  }

  const saveSettingsBtn = document.getElementById('save-settings');
  if (saveSettingsBtn) {
    saveSettingsBtn.addEventListener('click', saveSettingsModal);
  }
}

/**
 * Close the settings modal dialog.
 */ 
function closeSettingsModal() {
  const modal = document.getElementById('settings-modal');
  if (modal) {
    modal.classList.remove('active');
  }
}

/**
 * Switch the tab selected in the settings modal.
 * @param {string} tabId - The id of the tab to switch to.
 */ 
function switchTab(tabId: string) {
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
function restoreDefaultSettings() {
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
function saveSettingsModal() {
  getSettingsFromModal();
  saveSettings();
  closeSettingsModal();
}

/**
 * Load the available languages for the settings modal.
 */ 
async function loadAvailableLanguages() {
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
      languageSelect.value = appSettings.language;
    }
  } catch (error) {
    console.error('Failed to load available languages:', error);
  }
}

/**
 * Load the available date formats for the settings modal.
 */ 
async function loadAvailableDateFormats() {
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
      dateFormatSelect.value = appSettings.date_format;
    }
  } catch (error) {
    console.error('Failed to load available date formats:', error);
  }
}

/**
 * Load the available games for the settings modal.
 */ 
async function loadAvailableGames() {
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
      defaultGameSelect.value = appSettings.default_game;
    }
  } catch (error) {
    console.error('Failed to load available games:', error);
  }
}

/**
 * Load the settings from the settings to the modal.
 */ 
function loadSettingsToModal() {
  // Load checkbox values
  const checkUpdatesToggle = document.getElementById('check-updates-toggle') as HTMLInputElement;
  if (checkUpdatesToggle) {
    checkUpdatesToggle.checked = appSettings.check_updates_on_start;
  }
  
  const checkSchemaUpdatesToggle = document.getElementById('check-schema-updates-toggle') as HTMLInputElement;
  if (checkSchemaUpdatesToggle) {
    checkSchemaUpdatesToggle.checked = appSettings.check_schema_updates_on_start;
  }
  
  const checkSqlUpdatesToggle = document.getElementById('check-sql-updates-toggle') as HTMLInputElement;
  if (checkSqlUpdatesToggle) {
    checkSqlUpdatesToggle.checked = appSettings.check_sql_scripts_updates_on_start;
  }
  
  // Load dropdown values
  loadAvailableLanguages();
  loadAvailableDateFormats();
  loadAvailableGames();
  
  // Load game paths for the paths tab
  loadGamePaths();
}

/**
 * Save the settings from the modal.
 */ 
function getSettingsFromModal() {
  // Get checkbox values
  const checkUpdatesToggle = document.getElementById('check-updates-toggle') as HTMLInputElement;
  if (checkUpdatesToggle) {
    appSettings.check_updates_on_start = checkUpdatesToggle.checked;
  }
  
  const checkSchemaUpdatesToggle = document.getElementById('check-schema-updates-toggle') as HTMLInputElement;
  if (checkSchemaUpdatesToggle) {
    appSettings.check_schema_updates_on_start = checkSchemaUpdatesToggle.checked;
  }
  
  const checkSqlUpdatesToggle = document.getElementById('check-sql-updates-toggle') as HTMLInputElement;
  if (checkSqlUpdatesToggle) {
    appSettings.check_sql_scripts_updates_on_start = checkSqlUpdatesToggle.checked;
  }
  
  // Get dropdown values
  const languageSelect = document.getElementById('language-select') as HTMLSelectElement;
  if (languageSelect) {
    appSettings.language = languageSelect.value;
  }
  
  const dateFormatSelect = document.getElementById('date-format-select') as HTMLSelectElement;
  if (dateFormatSelect) {
    appSettings.date_format = dateFormatSelect.value;
  }
  
  const defaultGameSelect = document.getElementById('default-game-select') as HTMLSelectElement;
  if (defaultGameSelect) {
    appSettings.default_game = defaultGameSelect.value;
  }
  
  // Get game paths
  getGamePathsFromModal();
}

/**
 * Load the game paths for the settings modal.
 */ 
async function loadGamePaths() {
  try {
    const icons = await invoke("get_sidebar_icons") as SidebarIcon[];
    const gamePathsContainer = document.getElementById('game-paths-container');
    
    if (gamePathsContainer) {
      gamePathsContainer.innerHTML = '';
      
      for (const icon of icons) {
        const pathItem = document.createElement('div');
        pathItem.className = 'game-path-item';
        
        // Current path value from settings (or empty string if not set)
        const currentPath = appSettings.paths[icon.id] || '';
        // Locked state (default to false if not set)
        const isLocked = appSettings.paths[`${icon.id}_locked`] === 'true';
        
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
        browseBtn.addEventListener('click', () => openFolderDialog(icon.id));
        
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
async function openFolderDialog(gameId: string) {
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
function getGamePathsFromModal() {
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
    appSettings.paths[gameId] = input.value;
    
    // Update the locked state in settings
    if (checkbox) {
      appSettings.paths[`${gameId}_locked`] = checkbox.checked ? 'true' : 'false';
    }
  });
}

export {
  openSettingsModal,
}