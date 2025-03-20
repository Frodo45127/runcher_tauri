import { invoke } from "@tauri-apps/api/core";

interface SidebarIcon {
  id: string;
  name: string;
  icon: string;
}

interface TreeItem {
  id: string;
  name: string;
  flags: string;
  location: string;
  creator: string;
  type: string;
  size: string;
  created: number;
  updated: number;
  is_checked: boolean;
  status?: string;
  last_played?: string;
}

interface TreeCategory {
  id: string;
  name: string;
  size: string;
  status: string;
  last_played: string;
  children: TreeItem[];
}

interface ListItem {
  id: string;
  pack: string;
  item_type: string;
  order: number;
  location: string;
}

interface AppSettings {
  tree_open_state: { [key: string]: boolean };
  tree_filter_value: string;
  list_filter_value: string;
  selected_tree_item: string | null;
  selected_list_item: string | null;
  panel_heights: { [key: string]: number };
  right_panel_width: number;
  paths: { [key: string]: string };
  strings: { [key: string]: string };
  default_game: string;
  language: string;
  date_format: string;
  check_updates_on_start: boolean;
  check_schema_updates_on_start: boolean;
  check_sql_scripts_updates_on_start: boolean;
}

let selectedGameId: string | null = null;
let selectedListItemId: string | null = null;
// Store references to category and game elements for filtering
let categoryElements: Map<string, HTMLElement> = new Map();
let itemElements: Map<string, HTMLElement> = new Map();
let listElements: Map<string, HTMLElement> = new Map();
// Store the tree data
let treeData: TreeCategory[] = [];
// Store the list data
let listData: ListItem[] = [];
// Store app settings
let appSettings: AppSettings = {
  tree_open_state: {},
  tree_filter_value: '',
  list_filter_value: '',
  selected_tree_item: null,
  selected_list_item: null,
  panel_heights: {},
  right_panel_width: 300,
  paths: {},
  strings: {},
  default_game: 'warhammer_2',
  language: 'English',
  date_format: 'DD/MM/YYYY',
  check_updates_on_start: true,
  check_schema_updates_on_start: true,
  check_sql_scripts_updates_on_start: true
};

// Load sidebar icons from Rust
async function loadSidebarIcons() {
  try {
    const icons: SidebarIcon[] = await invoke("get_sidebar_icons");
    const sidebarContainer = document.getElementById("sidebar-buttons");

    if (sidebarContainer) {
      icons.forEach(icon => {
        const button = document.createElement("button");
        button.className = "sidebar-btn";
        button.dataset.id = icon.id;
        
        // Create an image element instead of using FontAwesome
        const img = document.createElement("img");
        img.src = `icons/${icon.icon}`;
        img.alt = icon.name;
        img.className = "sidebar-icon";
        
        button.appendChild(img);
        button.title = icon.name;
        
        button.addEventListener("click", (e) => {
          // Remove active class from all buttons
          document.querySelectorAll(".sidebar-btn").forEach(btn => 
            btn.classList.remove("active")
          );
          
          // Add active class to clicked button
          button.classList.add("active");

          console.log("Game selected changed");
          const isChecked = (e.target as HTMLInputElement).checked;
          const buttonId = button.dataset.id ? button.dataset.id : '';
          handleGameSelectedChangeChange(buttonId, isChecked);
          e.stopPropagation(); // Prevent the row selection from triggering
        });
        
        sidebarContainer.appendChild(button);

        if (appSettings.paths[icon.id] === undefined || appSettings.paths[icon.id] === "") {
          button.classList.add("hidden");
        }
      });
    }
  } catch (error) {
    console.error("Failed to load sidebar icons:", error);
  }
}

async function handleGameSelectedChangeChange(gameId: string, isChecked: boolean) {
  try {
    treeData = await invoke("handle_change_game_selected", { gameId: gameId }) as TreeCategory[];
    
    console.log(treeData);
    renderTree(treeData);
      
    // Expandir categorías guardadas
    Object.keys(appSettings.tree_open_state).forEach(categoryId => {
      if (appSettings.tree_open_state[categoryId]) {
        toggleCategoryExpansion(categoryId, true);
      }
    });
    
    // Restaurar el item seleccionado si existe
    if (appSettings.selected_tree_item) {
      selectTreeItem(appSettings.selected_tree_item);
    }
    
    // Update status bar with result
    const statusMessage = document.querySelector(".status-message");
    if (statusMessage) {
      //statusMessage.textContent = result as string;
    }
    
    // Save settings after change
    await saveSettings();
  } catch (error) {
    console.error("Failed to handle checkbox change:", error);
  }
}

// Initialize resizable panels
function initializeResizablePanels() {
  // Set right panel width from settings
  document.documentElement.style.setProperty('--right-panel-width', `${appSettings.right_panel_width}px`);

  // Vertical resizing for panels
  const resizables = document.querySelectorAll('.resizable');
  
  resizables.forEach((panel: Element) => {
    const handle = panel.querySelector('.resize-handle');
    const panelId = (panel as HTMLElement).id;
    
    // Apply saved height from settings if available
    if (panelId && appSettings.panel_heights[panelId]) {
      (panel as HTMLElement).style.height = `${appSettings.panel_heights[panelId]}px`;
    }
    
    if (handle) {
      handle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const mouseEvent = e as MouseEvent;
        const startY = mouseEvent.clientY;
        const startHeight = parseInt(window.getComputedStyle(panel).height, 10);
        
        function onMouseMove(moveEvent: MouseEvent) {
          const dy = moveEvent.clientY - startY;
          const newHeight = startHeight + dy;
          if (newHeight > 100) { // Minimum height
            (panel as HTMLElement).style.height = `${newHeight}px`;
          }
        }
        
        function onMouseUp() {
          document.removeEventListener('mousemove', onMouseMove);
          document.removeEventListener('mouseup', onMouseUp);
          
          // Save the new height to settings
          if (panelId) {
            appSettings.panel_heights[panelId] = parseInt(window.getComputedStyle(panel).height, 10);
            saveSettings();
          }
          
          // Make the last panel expand to fill remaining space
          const panels = Array.from(resizables);
          if (panels.length > 0 && panels[panels.length - 1] !== panel) {
            const lastPanel = panels[panels.length - 1] as HTMLElement;
            lastPanel.style.flex = '1';
          }
        }
        
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
      });
    }
  });
  
  // Horizontal resizing for main content and right panel
  const horizontalHandle = document.querySelector('.horizontal-resize-handle');
  if (horizontalHandle) {
    horizontalHandle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const mouseEvent = e as MouseEvent;
      const startX = mouseEvent.clientX;
      const startWidth = appSettings.right_panel_width;
      
      function onMouseMove(moveEvent: MouseEvent) {
        // Calculate how much to resize based on mouse movement
        const dx = moveEvent.clientX - startX;
        const containerWidth = document.querySelector('.app-container')?.clientWidth || 0;
        const newWidth = Math.max(200, Math.min(containerWidth * 0.6, startWidth - dx));
        
        // Update CSS variable for right panel width
        document.documentElement.style.setProperty('--right-panel-width', `${newWidth}px`);
        appSettings.right_panel_width = newWidth;
      }
      
      function onMouseUp() {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        
        // Save the new width to settings
        saveSettings();
      }
      
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  }
}

// Load list items from Rust
async function loadListItems() {
  try {
    listData = await invoke("get_list_items");
    renderListItems();
  } catch (error) {
    console.error("Failed to load list items:", error);
  }
}

// Render list items
function renderListItems() {
  const listContainer = document.getElementById("list-items-container");
  
  if (listContainer) {
    listContainer.innerHTML = "";
    listElements.clear();
    
    listData.forEach(item => {
      const listItem = document.createElement("div");
      listItem.className = "list-item";
      listItem.dataset.id = item.id;
      listItem.dataset.pack = item.pack.toLowerCase();
      listItem.dataset.type = item.item_type.toLowerCase();
      listItem.dataset.location = item.location.toLowerCase();
      
      listItem.innerHTML = `
        <div>${item.pack}</div>
        <div>${item.item_type}</div>
        <div>${item.order}</div>
        <div>${item.location}</div>
      `;
      
      listItem.addEventListener("click", () => {
        // Deselect all items
        document.querySelectorAll(".list-item").forEach(item => 
          item.classList.remove("selected")
        );
        
        // Select this item
        listItem.classList.add("selected");
        selectedListItemId = item.id;
      });
      
      listContainer.appendChild(listItem);
      listElements.set(item.id, listItem);
    });
  }
}

// Filter list items
function filterListItems(searchText: string) {
  const normalizedSearchText = searchText.toLowerCase().trim();
  
  if (normalizedSearchText === '') {
    listElements.forEach(element => element.classList.remove('hidden'));
    return;
  }
  
  listElements.forEach(element => {
    const pack = element.dataset.pack || '';
    const type = element.dataset.type || '';
    const location = element.dataset.location || '';
    
    if (
      pack.includes(normalizedSearchText) || 
      type.includes(normalizedSearchText) || 
      location.includes(normalizedSearchText)
    ) {
      element.classList.remove('hidden');
    } else {
      element.classList.add('hidden');
    }
  });
}

// Load app settings
async function initSettings() {
  try {
    const settings = await invoke('init_settings') as Partial<AppSettings>;
    appSettings = {
      ...appSettings,
      ...(settings as AppSettings)
    };
    
    // Apply the loaded settings
    const treeFilter = document.getElementById('tree-filter') as HTMLInputElement;
    if (treeFilter && appSettings.tree_filter_value) {
      treeFilter.value = appSettings.tree_filter_value;
      filterTreeItems(appSettings.tree_filter_value);
    }
    
    const listFilter = document.getElementById('list-filter') as HTMLInputElement;
    if (listFilter && appSettings.list_filter_value) {
      listFilter.value = appSettings.list_filter_value;
      filterListItems(appSettings.list_filter_value);
    }
    
    // Set panel width from settings
    document.documentElement.style.setProperty('--right-panel-width', `${appSettings.right_panel_width}px`);
  } catch (error) {
    console.error('Failed to load settings:', error);
  }
}

// Load app settings
async function loadSettings() {
  try {
    const settings = await invoke('load_settings') as Partial<AppSettings>;
    appSettings = {
      ...appSettings,
      ...(settings as AppSettings)
    };
    
    // Apply the loaded settings
    const treeFilter = document.getElementById('tree-filter') as HTMLInputElement;
    if (treeFilter && appSettings.tree_filter_value) {
      treeFilter.value = appSettings.tree_filter_value;
      filterTreeItems(appSettings.tree_filter_value);
    }
    
    const listFilter = document.getElementById('list-filter') as HTMLInputElement;
    if (listFilter && appSettings.list_filter_value) {
      listFilter.value = appSettings.list_filter_value;
      filterListItems(appSettings.list_filter_value);
    }
    
    // Set panel width from settings
    document.documentElement.style.setProperty('--right-panel-width', `${appSettings.right_panel_width}px`);
  } catch (error) {
    console.error('Failed to load settings:', error);
  }
}

// Save app settings
async function saveSettings() {
  try {
    await invoke('save_settings', { 
      settings: {
        tree_open_state: appSettings.tree_open_state,
        tree_filter_value: appSettings.tree_filter_value,
        list_filter_value: appSettings.list_filter_value,
        selected_tree_item: appSettings.selected_tree_item,
        selected_list_item: appSettings.selected_list_item,
        panel_heights: appSettings.panel_heights,
        right_panel_width: appSettings.right_panel_width,
        paths: appSettings.paths,
        strings: appSettings.strings,
        default_game: appSettings.default_game,
        language: appSettings.language,
        date_format: appSettings.date_format,
        check_updates_on_start: appSettings.check_updates_on_start,
        check_schema_updates_on_start: appSettings.check_schema_updates_on_start,
        check_sql_scripts_updates_on_start: appSettings.check_sql_scripts_updates_on_start
      }
    });
  } catch (error) {
    console.error('Failed to save settings:', error);
  }
}

// Manejar cambio en checkbox
async function handleCheckboxChange(itemId: string, isChecked: boolean) {
  try {
    // Llamar a la función Rust para manejar el cambio del checkbox
    const result = await invoke('handle_checkbox_change', { 
      game_id: itemId, 
      is_checked: isChecked 
    });
    
    console.log(result);
    
    // Actualizar la UI visualmente si es necesario
    const checkbox = document.querySelector(`#check-${itemId}`) as HTMLInputElement;
    if (checkbox) {
      checkbox.checked = isChecked;
    }
  } catch (error) {
    console.error('Failed to handle checkbox change:', error);
  }
}

// Handle item drop
async function handleItemDrop(sourceId: string, targetId: string) {
  try {
    const result = await invoke("handle_item_drop", { sourceId, targetId });
    
    // Update status bar with result
    const statusMessage = document.querySelector(".status-message");
    if (statusMessage) {
      statusMessage.textContent = result as string;
    }
    
    // Reload tree data to reflect changes
    //await loadTreeData();
    
    // Save settings after change
    await saveSettings();
  } catch (error) {
    console.error("Failed to handle item drop:", error);
  }
}

// Toggle category expansion
function toggleCategoryExpansion(categoryId: string, forceState?: boolean) {
  categoryId = CSS.escape(categoryId);

  const categoryElement = categoryElements.get(categoryId);
  console.log(categoryElement);
  if (!categoryElement) return;
  
  const childrenContainer = document.getElementById(`children-${categoryId}`);
  console.log(childrenContainer);
  if (!childrenContainer) return;
  
  const isExpanded = categoryElement.classList.contains('expanded');
  
  // If forceState is provided, use it, otherwise toggle
  const newState = forceState !== undefined ? forceState : !isExpanded;
  
  if (newState) {
    categoryElement.classList.add('expanded');
    childrenContainer.classList.add('expanded');
  } else {
    categoryElement.classList.remove('expanded');
    childrenContainer.classList.remove('expanded');
  }
  
  // Save settings when expansion state changes
  appSettings.tree_open_state[categoryId] = newState;
  saveSettings();
}

// Setup drag and drop for an element
function setupDragAndDrop(element: HTMLElement) {
  // Drag start event
  element.addEventListener("dragstart", (e) => {
    e.dataTransfer?.setData("text/plain", element.dataset.id || "");
    element.classList.add("dragging");
  });
  
  // Drag end event
  element.addEventListener("dragend", () => {
    element.classList.remove("dragging");
  });
  
  // Drag over event
  element.addEventListener("dragover", (e) => {
    e.preventDefault();
    element.classList.add("drag-over");
  });
  
  // Drag leave event
  element.addEventListener("dragleave", () => {
    element.classList.remove("drag-over");
  });
  
  // Drop event
  element.addEventListener("drop", (e) => {
    e.preventDefault();
    element.classList.remove("drag-over");
    
    const sourceId = e.dataTransfer?.getData("text/plain");
    const targetId = element.dataset.id;
    
    if (sourceId && targetId && sourceId !== targetId) {
      handleItemDrop(sourceId, targetId);
    }
  });
}

// Update game details in the right panel
function updateGameDetails(game: TreeItem) {
  const gameDetails = document.getElementById("game-details");
  
  if (gameDetails) {
    gameDetails.innerHTML = `
      <p><strong>Name:</strong> ${game.name}</p>
      <p><strong>Size:</strong> ${game.size}</p>
      <p><strong>Status:</strong> ${game.status}</p>
      <p><strong>Last Played:</strong> ${game.last_played}</p>
    `;
  }
}

// Filter tree items based on search text
function filterTreeItems(searchText: string) {
  const normalizedSearchText = searchText.toLowerCase().trim();
  appSettings.tree_filter_value = normalizedSearchText;
  
  // If search text is empty, show all items
  if (normalizedSearchText === '') {
    categoryElements.forEach(element => element.classList.remove('hidden'));
    itemElements.forEach(element => element.classList.remove('hidden'));
    document.querySelectorAll('.category-items').forEach(
      element => element.classList.remove('hidden')
    );
    return;
  }
  
  // First, hide all items
  categoryElements.forEach(element => element.classList.add('hidden'));
  itemElements.forEach(element => element.classList.add('hidden'));
  document.querySelectorAll('.category-items').forEach(
    element => element.classList.add('hidden')
  );
  
  // Keep track of categories that need to be shown
  const categoriesToShow = new Set<string>();
  console.log(itemElements);
  // Check each game element
  itemElements.forEach((element, id) => {
    const itemId = element.dataset.id || '';
    const categoryId = element.dataset.categoryId || '';

    if (itemId.includes(normalizedSearchText)) {
      // Show this game
      element.classList.remove('hidden');
      // Mark its category to be shown
      categoriesToShow.add(categoryId);
      // Show its container
      const childrenContainer = document.getElementById(`children-${categoryId}`);
      if (childrenContainer) {
        childrenContainer.classList.remove('hidden');
      }
    }
  });
  
  // Show the categories that contain matching games
  categoriesToShow.forEach(categoryId => {
    const categoryElement = categoryElements.get(categoryId);
    if (categoryElement) {
      categoryElement.classList.remove('hidden');
      // Make sure the category is expanded
      toggleCategoryExpansion(categoryId, true);
    }
  });
  
  // Also check category names for matches
  categoryElements.forEach((element, categoryId) => {
    const categoryName = element.dataset.name || '';
    
    if (categoryName.includes(normalizedSearchText)) {
      // Show this category
      element.classList.remove('hidden');
      
      // Show its container and children
      const childrenContainer = document.getElementById(`children-${categoryId}`);
      if (childrenContainer) {
        childrenContainer.classList.remove('hidden');
        // Make sure the category is expanded
        toggleCategoryExpansion(categoryId, true);
      }
      
      // Show all its children
      itemElements.forEach((itemElement) => {
        if (itemElement.dataset.categoryId === categoryId) {
          itemElement.classList.remove('hidden');
        }
      });
    }
  });
}

// Launch game function
async function launchGame() {
  if (selectedGameId) {
    try {
      const result = await invoke("launch_game", { id: selectedGameId });
      
      // Update status bar
      const statusMessage = document.querySelector(".status-message");
      if (statusMessage) {
        statusMessage.textContent = result as string;
      }
    } catch (error) {
      console.error("Failed to launch game:", error);
      
      // Update status bar with error
      const statusMessage = document.querySelector(".status-message");
      if (statusMessage) {
        statusMessage.textContent = `Error: ${error}`;
      }
    }
  } else {
    // Update status bar
    const statusMessage = document.querySelector(".status-message");
    if (statusMessage) {
      statusMessage.textContent = "No game selected";
    }
  }
}

// Settings Modal Functions
function openSettingsModal() {
  loadSettingsToModal();
  
  const modal = document.getElementById('settings-modal');
  if (modal) {
    modal.classList.add('active');
  }
}

function closeSettingsModal() {
  const modal = document.getElementById('settings-modal');
  if (modal) {
    modal.classList.remove('active');
  }
}

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

function saveSettingsModal() {
  getSettingsFromModal();
  saveSettings();
  closeSettingsModal();
}

// Load available languages for settings modal
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

// Load available date formats for settings modal
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

// Load available games for settings modal
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

// Load values from settings to the modal
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

// Save modal values to settings
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

// Load game paths for settings modal
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
        
        inputContainer.appendChild(input);
        inputContainer.appendChild(browseBtn);
        
        pathRow.appendChild(label);
        pathRow.appendChild(inputContainer);
        
        // Create the lock checkbox row
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
        
        lockContainer.appendChild(lockCheckbox);
        lockContainer.appendChild(lockLabel);
        
        // Add everything to the path item
        pathItem.appendChild(pathRow);
        pathItem.appendChild(lockContainer);
        
        // Add to the container
        gamePathsContainer.appendChild(pathItem);
      }
    }
  } catch (error) {
    console.error('Failed to load game paths:', error);
  }
}

// Open folder dialog for selecting game path
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

// Get game paths from modal
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

// Función actualizada para renderizar el árbol
function renderTree(categories: TreeCategory[]) {
  const treeContainer = document.getElementById('tree-container');
  if (!treeContainer) return;

  // Clear maps for filtering
  categoryElements.clear();
  itemElements.clear();
  
  treeContainer.innerHTML = '';
  
  categories.forEach(category => {
    const categoryElement = document.createElement('div');
    categoryElement.className = 'tree-category';
    categoryElement.dataset.id = CSS.escape(category.id);

    // Add drag and drop event listeners
    setupDragAndDrop(categoryElement);

    const categoryHeader = document.createElement('div');
    categoryHeader.className = 'category-header';
    categoryHeader.innerHTML = `
      <span class="expander"><i class="fa-solid fa-chevron-right"></i></span>
      <span class="category-name">${category.id}</span>
    `;
    categoryHeader.addEventListener('click', () => {
      console.log(categoryElement.getAttribute('data-id'));
      toggleCategoryExpansion(categoryElement.getAttribute('data-id') || '')
    });

    const itemsContainer = document.createElement('div');
    itemsContainer.className = 'category-items';
    itemsContainer.id = `children-${categoryElement.getAttribute('data-id')}`;
    
    category.children.forEach(item => {
      const itemElement = document.createElement('div');
      itemElement.className = 'tree-item tree-child';
      itemElement.dataset.id = CSS.escape(item.id);
      itemElement.dataset.categoryId = categoryElement.getAttribute('data-id') || '';
      // Para HTML seguro, usar createTextNode o implementar sanitización
      // El name puede contener HTML por design en el backend
      const itemContent = document.createElement('div');
      itemContent.className = 'item-content';
      itemContent.innerHTML = `
        <div class="item-checkbox">
          <input type="checkbox" ${item.is_checked ? 'checked' : ''} id="check-${itemElement.getAttribute('data-id')}">
        </div>
        <div class="item-details">
          <div class="item-row">
            <div class="item-name">${item.name}</div>
          </div>
          <div class="item-row item-info">
            <div class="item-type">${item.type || ''}</div>
            <div class="item-creator">${item.creator || ''}</div>
            <div class="item-location">${item.location || ''}</div>
            <div class="item-size">${item.size || ''}</div>
          </div>
        </div>
      `;
      
      // Evento para manejo de checkbox
      const checkbox = itemContent.querySelector(`#check-${itemElement.getAttribute('data-id')}`) as HTMLInputElement;
      if (checkbox) {
        checkbox.addEventListener('change', (e) => {
          handleCheckboxChange(itemElement.getAttribute('data-id') || '', checkbox.checked);
        });
      }
      
      // Add drag and drop event listeners
      setupDragAndDrop(itemElement);

      // Evento para seleccionar item
      itemContent.addEventListener('click', (e) => {
        if (e.target !== checkbox) {
          selectTreeItem(itemElement.getAttribute('data-id') || '');
        }
      });
      
      itemElement.appendChild(itemContent);
      itemsContainer.appendChild(itemElement);

      itemElements.set(itemElement.getAttribute('data-id') || '', itemElement);
    });
    
    categoryElement.appendChild(categoryHeader);
    categoryElement.appendChild(itemsContainer);
    treeContainer.appendChild(categoryElement);

    categoryElements.set(categoryElement.getAttribute('data-id') || '', categoryElement);

    if (appSettings.tree_open_state[category.id] === true) {
      toggleCategoryExpansion(category.id, true);
    }
  });
}

// Función para obtener el juego seleccionado en la barra lateral
function getSidebarSelectedButton(): string {
  const selectedButton = document.querySelector('.sidebar-btn.active') as HTMLElement;
  return selectedButton ? selectedButton.dataset.id || '' : '';
}

// Función para seleccionar un item del árbol
function selectTreeItem(itemId: string) {
  // Quitar la selección actual
  const currentSelected = document.querySelector('.tree-item.selected');
  if (currentSelected) {
    currentSelected.classList.remove('selected');
  }
  
  // Seleccionar el nuevo item
  const newSelected = document.querySelector(`.tree-item[data-id="${itemId}"]`);
  if (newSelected) {
    newSelected.classList.add('selected');
    
    // Asegurarse de que la categoría esté expandida
    const categoryContainer = newSelected.closest('.tree-category');
    if (categoryContainer) {
      const categoryId = categoryContainer.getAttribute('data-id');
      if (categoryId) {
        const categoryItems = categoryContainer.querySelector('.category-items');
        if (categoryItems && categoryItems.classList.contains('hidden')) {
          toggleCategoryExpansion(categoryId);
        }
      }
    }
    
    // Actualizar el item seleccionado en la configuración
    appSettings.selected_tree_item = itemId;
    saveSettings();
    
    // Mostrar detalles del item (si corresponde)
    showItemDetails(itemId);
  }
}

// Función para mostrar detalles del item seleccionado
function showItemDetails(itemId: string) {
  const gameDetails = document.getElementById('game-details');
  if (!gameDetails) return;
  
  // Encontrar el item en los datos
  let selectedItem: TreeItem | null = null;
  
  // Aquí tendríamos que buscar en los datos cargados el item con el ID correspondiente
  // Esta es una implementación simplificada
  document.querySelectorAll('.tree-item').forEach(el => {
    if (el.getAttribute('data-id') === itemId) {
      const nameElement = el.querySelector('.item-name');
      const typeElement = el.querySelector('.item-type');
      const creatorElement = el.querySelector('.item-creator');
      const locationElement = el.querySelector('.item-location');
      const sizeElement = el.querySelector('.item-size');
      
      if (nameElement && typeElement && creatorElement && locationElement && sizeElement) {
        const details = `
          <div class="detail-item">
            <strong>Name:</strong> ${nameElement.innerHTML}
          </div>
          <div class="detail-item">
            <strong>Type:</strong> ${typeElement.textContent || 'N/A'}
          </div>
          <div class="detail-item">
            <strong>Creator:</strong> ${creatorElement.textContent || 'N/A'}
          </div>
          <div class="detail-item">
            <strong>Location:</strong> ${locationElement.textContent || 'N/A'}
          </div>
          <div class="detail-item">
            <strong>Size:</strong> ${sizeElement.textContent || 'N/A'}
          </div>
        `;
        
        gameDetails.innerHTML = details;
      }
    }
  });
}

// Initialize the app
window.addEventListener("DOMContentLoaded", async () => {
  console.log('DOM fully loaded');
  
  try {
    // Notify Rust that the window is ready
    const response = await invoke('on_window_ready');
    console.log('Window ready notification sent to Rust:', response);
  } catch (error) {
    console.error('Error during window ready notification:', error);
  }

  await initSettings();
    
  // Load sidebar icons
  await loadSidebarIcons();
    
  // Load and render list items
  await loadListItems();
  
  // Initialize resizable panels
  initializeResizablePanels();

  // Load the default game
  const defaultGame = appSettings.default_game;
  const sidebarContainer = document.getElementById("sidebar-buttons");
  if (defaultGame && sidebarContainer) {
    const buttons = sidebarContainer.querySelectorAll(".sidebar-btn");
    const defaultGameButton = Array.from(buttons).find(button => button.getAttribute('data-id') === defaultGame) as HTMLButtonElement;
    if (defaultGameButton && !defaultGameButton.classList.contains("hidden")) {
      defaultGameButton.click();
    }
  }
  
  // Setup tree filter
  const treeFilterInput = document.getElementById('tree-filter') as HTMLInputElement;
  if (treeFilterInput) {
    treeFilterInput.addEventListener('input', () => {
      filterTreeItems(treeFilterInput.value);
    });
  }
  
  // Setup list filter
  const listFilterInput = document.getElementById('list-filter') as HTMLInputElement;
  if (listFilterInput) {
    listFilterInput.addEventListener('input', () => {
      filterListItems(listFilterInput.value);
    });
  }
  
  // Add event listener for launch button
  const launchButton = document.getElementById("launch-game-btn");
  if (launchButton) {
    launchButton.addEventListener("click", launchGame);
  }

  // Setup settings modal
  const settingsBtn = document.getElementById('settings-btn');
  if (settingsBtn) {
    settingsBtn.addEventListener('click', openSettingsModal);
  }

  const closeBtn = document.querySelector('.close-btn');
  if (closeBtn) {
    closeBtn.addEventListener('click', closeSettingsModal);
  }

  const tabButtons = document.querySelectorAll('.tab-btn');
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.getAttribute('data-tab');
      if (tabId) {
        switchTab(tabId);
      }
    });
  });

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

  // Close modal when clicking outside
  const modal = document.getElementById('settings-modal');
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeSettingsModal();
      }
    });
  }
});
