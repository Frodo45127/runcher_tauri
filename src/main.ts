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

let selectedGameId: string | null = null;
// Store references to category and game elements for filtering
let categoryElements: Map<string, HTMLElement> = new Map();
let gameElements: Map<string, HTMLElement> = new Map();
// Store the tree data
let treeData: TreeCategory[] = [];

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
        button.innerHTML = `<i class="fa-solid fa-${icon.icon}"></i>`;
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
  } catch (error) {
    console.error("Failed to handle item drop:", error);
  }
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
        // Toggle expansion (in a real app, this would show/hide children)
        const isExpanded = categoryElement.classList.contains("expanded");
        categoryElement.classList.toggle("expanded");
        
        // In this simple example, we're not actually hiding children
      });
      
      treeContainer.appendChild(categoryElement);
      // Store reference for filtering
      categoryElements.set(category.id, categoryElement);
      
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
            }
          });
          
          treeContainer.appendChild(gameElement);
          // Store reference for filtering
          gameElements.set(game.id, gameElement);
        });
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
    return;
  }
  
  // First, hide all items
  categoryElements.forEach(element => element.classList.add('hidden'));
  gameElements.forEach(element => element.classList.add('hidden'));
  
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
    }
  });
  
  // Show the categories that contain matching games
  categoriesToShow.forEach(categoryId => {
    const categoryElement = categoryElements.get(categoryId);
    if (categoryElement) {
      categoryElement.classList.remove('hidden');
    }
  });
  
  // Also check category names for matches
  categoryElements.forEach((element, categoryId) => {
    const categoryName = element.dataset.name || '';
    
    if (categoryName.includes(normalizedSearchText)) {
      // Show this category
      element.classList.remove('hidden');
      
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

// Initialize the app
window.addEventListener("DOMContentLoaded", async () => {
  // Load sidebar icons
  await loadSidebarIcons();
  
  // Load and render tree data
  await loadTreeData();
  
  // Setup filter
  const filterInput = document.getElementById('tree-filter') as HTMLInputElement;
  if (filterInput) {
    filterInput.addEventListener('input', () => {
      filterTreeItems(filterInput.value);
    });
  }
  
  // Add event listener for launch button
  const launchButton = document.getElementById("launch-game-btn");
  if (launchButton) {
    launchButton.addEventListener("click", launchGame);
  }
});
