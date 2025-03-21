import { invoke } from "@tauri-apps/api/core";
import { renderListItems, filterListItems } from "./packList";

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
  type: string;
  order: number;
  location: string;
  steam_id: string;
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

/**
 * Returns the average of two numbers.
 *
 * @remarks
 * This method is part of the {@link core-library#Statistics | Statistics subsystem}.
 *
 * @param x - The first input number
 * @param y - The second input number
 * @returns The arithmetic mean of `x` and `y`
 *
 * @beta
 */
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
    listData = await invoke('handle_checkbox_change', { 
      modId: itemId.replace(/\\/g, ''), 
      isChecked: isChecked 
    });

    console.log(listData);
    renderListItems();
   
    // Actualizar la UI visualmente si es necesario
    //const checkbox = document.querySelector(`#check-${itemId}`) as HTMLInputElement;
    //if (checkbox) {
    //  checkbox.checked = isChecked;
    //}
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


// Launch game function
async function launchGame() {
  // Update status bar
  const statusMessage = document.querySelector(".status-message");
  try {

    const button = document.querySelector('.sidebar-btn.active') as HTMLElement;
    if (button) {
      const id = button.dataset.id || '';
      const result = await invoke("launch_game", { 
        id: id 
      });

      // Update status bar
      const statusMessage = document.querySelector(".status-message");
      if (statusMessage) {
        statusMessage.textContent = result as string;
      }
    }
    else {
      if (statusMessage) {
        statusMessage.textContent = "No game selected";
      }
    }
  } catch (error) {
    console.error("Failed to launch game:", error);
    
    // Update status bar with error
    if (statusMessage) {
      statusMessage.textContent = `Error: ${error}`;
    }
  }
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
});
