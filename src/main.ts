import { invoke } from "@tauri-apps/api/core";

interface SidebarIcon {
  id: string;
  name: string;
  icon: string;
}

interface TreeItem {
  id: string;
  name: string;
  size: string;
  status: string;
  last_played: string;
  is_checked: boolean;
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
}

let selectedGameId: string | null = null;
let selectedListItemId: string | null = null;
// Store references to category and game elements for filtering
let categoryElements: Map<string, HTMLElement> = new Map();
let gameElements: Map<string, HTMLElement> = new Map();
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
  strings: {}
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
        
        button.addEventListener("click", () => {
          // Remove active class from all buttons
          document.querySelectorAll(".sidebar-btn").forEach(btn => 
            btn.classList.remove("active")
          );
          
          // Add active class to clicked button
          button.classList.add("active");
        });
        
        sidebarContainer.appendChild(button);
      });
      
      // Set first button as active by default
      const firstButton = sidebarContainer.querySelector(".sidebar-btn");
      if (firstButton) {
        firstButton.classList.add("active");
      }
    }
  } catch (error) {
    console.error("Failed to load sidebar icons:", error);
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
        strings: appSettings.strings
      }
    });
  } catch (error) {
    console.error('Failed to save settings:', error);
  }
}

// Load tree data from Rust
async function loadTreeData() {
  try {
    treeData = await invoke("get_tree_data");
    renderTreeView();
  } catch (error) {
    console.error("Failed to load tree data:", error);
  }
}

// Handle checkbox change
async function handleCheckboxChange(gameId: string, isChecked: boolean) {
  try {
    const result = await invoke("handle_checkbox_change", { gameId, isChecked });
    
    // Update status bar with result
    const statusMessage = document.querySelector(".status-message");
    if (statusMessage) {
      statusMessage.textContent = result as string;
    }
    
    // Save settings after change
    await saveSettings();
  } catch (error) {
    console.error("Failed to handle checkbox change:", error);
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
    await loadTreeData();
    
    // Save settings after change
    await saveSettings();
  } catch (error) {
    console.error("Failed to handle item drop:", error);
  }
}

// Toggle category expansion
function toggleCategoryExpansion(categoryId: string, forceState?: boolean) {
  const categoryElement = categoryElements.get(categoryId);
  if (!categoryElement) return;
  
  const childrenContainer = document.getElementById(`children-${categoryId}`);
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
  saveSettings();
}

// Render the tree view
function renderTreeView() {
  const treeContainer = document.getElementById("tree-container");
  
  if (treeContainer) {
    treeContainer.innerHTML = "";
    // Clear maps for filtering
    categoryElements.clear();
    gameElements.clear();
    
    treeData.forEach(category => {
      // Create parent/category item
      const categoryElement = document.createElement("div");
      categoryElement.className = "tree-item tree-parent";
      categoryElement.dataset.id = category.id;
      categoryElement.dataset.name = category.name.toLowerCase();
      categoryElement.draggable = true;
      categoryElement.innerHTML = `
        <div>${category.name}</div>
        <div>${category.size}</div>
        <div>${category.status}</div>
        <div>${category.last_played}</div>
      `;
      
      // Add drag and drop event listeners
      setupDragAndDrop(categoryElement);
      
      categoryElement.addEventListener("click", () => {
        toggleCategoryExpansion(category.id);
      });
      
      treeContainer.appendChild(categoryElement);
      // Store reference for filtering
      categoryElements.set(category.id, categoryElement);
      
      // Create a container for children
      const childrenContainer = document.createElement("div");
      childrenContainer.id = `children-${category.id}`;
      childrenContainer.className = "tree-children";
      treeContainer.appendChild(childrenContainer);
      
      // Create children
      if (category.children) {
        category.children.forEach(game => {
          const gameElement = document.createElement("div");
          gameElement.className = "tree-item tree-child";
          gameElement.dataset.id = game.id;
          gameElement.dataset.name = game.name.toLowerCase();
          gameElement.dataset.categoryId = category.id;
          gameElement.draggable = true;
          
          const checkbox = document.createElement("input");
          checkbox.type = "checkbox";
          checkbox.className = "tree-checkbox";
          checkbox.checked = game.is_checked;
          
          // Add event listener for checkbox changes
          checkbox.addEventListener("change", (e) => {
            const isChecked = (e.target as HTMLInputElement).checked;
            handleCheckboxChange(game.id, isChecked);
            e.stopPropagation(); // Prevent the row selection from triggering
          });
          
          const nameCell = document.createElement("div");
          nameCell.appendChild(checkbox);
          nameCell.appendChild(document.createTextNode(game.name));
          
          gameElement.appendChild(nameCell);
          gameElement.innerHTML += `
            <div>${game.size}</div>
            <div>${game.status}</div>
            <div>${game.last_played}</div>
          `;
          
          // Add drag and drop event listeners
          setupDragAndDrop(gameElement);
          
          gameElement.addEventListener("click", (e) => {
            // Prevent checkbox clicks from triggering the row selection
            if (e.target !== checkbox) {
              // Select this game
              document.querySelectorAll(".tree-item").forEach(item => 
                item.classList.remove("selected")
              );
              
              gameElement.classList.add("selected");
              selectedGameId = game.id;
              
              // Update game details
              updateGameDetails(game);
              
              // Save settings after selection
              saveSettings();
            }
          });
          
          childrenContainer.appendChild(gameElement);
          // Store reference for filtering
          gameElements.set(game.id, gameElement);
          
          // If this is the selected game, select it
          if (game.id === selectedGameId) {
            gameElement.classList.add("selected");
            updateGameDetails(game);
          }
        });
      }
      
      // Set initial expanded state based on settings
      if (appSettings.tree_open_state[category.id] === true) {
        toggleCategoryExpansion(category.id, true);
      }
    });
  }
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
  
  // If search text is empty, show all items
  if (normalizedSearchText === '') {
    categoryElements.forEach(element => element.classList.remove('hidden'));
    gameElements.forEach(element => element.classList.remove('hidden'));
    document.querySelectorAll('.tree-children').forEach(
      element => element.classList.remove('hidden')
    );
    return;
  }
  
  // First, hide all items
  categoryElements.forEach(element => element.classList.add('hidden'));
  gameElements.forEach(element => element.classList.add('hidden'));
  document.querySelectorAll('.tree-children').forEach(
    element => element.classList.add('hidden')
  );
  
  // Keep track of categories that need to be shown
  const categoriesToShow = new Set<string>();
  
  // Check each game element
  gameElements.forEach((element, gameId) => {
    const gameName = element.dataset.name || '';
    const categoryId = element.dataset.categoryId || '';
    
    if (gameName.includes(normalizedSearchText)) {
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
      gameElements.forEach((gameElement) => {
        if (gameElement.dataset.categoryId === categoryId) {
          gameElement.classList.remove('hidden');
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
  // Reset all form elements to their default values
  const themeSelect = document.querySelector('#general-tab select') as HTMLSelectElement;
  if (themeSelect) themeSelect.value = 'dark';

  const languageSelect = document.querySelector('#general-tab select:nth-child(2)') as HTMLSelectElement;
  if (languageSelect) languageSelect.value = 'en';

  const cacheInput = document.querySelector('#advanced-tab input') as HTMLInputElement;
  if (cacheInput) cacheInput.value = '1024';

  const logSelect = document.querySelector('#advanced-tab select') as HTMLSelectElement;
  if (logSelect) logSelect.value = 'info';
}

function saveSettingsModal() {
  // Here you would implement the logic to save the settings
  // For now, we'll just close the modal
  closeSettingsModal();
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
  
  // Load and render tree data
  await loadTreeData();
  
  // Load and render list items
  await loadListItems();
  
  // Initialize resizable panels
  initializeResizablePanels();
  
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
