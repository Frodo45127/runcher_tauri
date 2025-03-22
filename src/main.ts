import { invoke } from "@tauri-apps/api/core";
import { SettingsManager } from "./settings";
import { Sidebar } from "./sidebar";
import { ModTree } from "./modTree";
import { PackList } from "./packList";
import { SettingsModal } from "./settingsModal";


// Store the main instance, which should contain everything in the app.
let main: Main;


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


class Main {
  private settingsManager: SettingsManager;
  private sidebar: Sidebar;
  private modTree: ModTree;
  private packList: PackList;
  private settingsModal: SettingsModal;

  private launchBtn: HTMLElement;
  private settingsBtn: HTMLElement;

  constructor() {
    this.sidebar = new Sidebar(this);
    this.modTree = new ModTree(this);
    this.packList = new PackList(this);
    this.settingsModal = new SettingsModal(this);
       
    // Add event listener for launch button
    this.launchButton = document.getElementById("launch-game-btn");
    this.launchButton.addEventListener("click", () => this.launchGame());
    
    // Setup settings modal
    this.settingsBtn = document.getElementById('settings-btn');
    this.settingsBtn.addEventListener('click', () => this.settingsModal.openSettingsModal(this));
    
    // Once everything is loaded, apply the settings.
    this.settingsManager = new SettingsManager(this);

    // Initialize resizable panels
    this.initializeResizablePanels();
  }

  // Initialize resizable panels
  initializeResizablePanels() {
    // Set right panel width from settings
    document.documentElement.style.setProperty('--right-panel-width', `${this.settingsManager.appSettings.right_panel_width}px`);

    // Vertical resizing for panels
    const resizables = document.querySelectorAll('.resizable');
    
    resizables.forEach((panel: Element) => {
      const handle = panel.querySelector('.resize-handle');
      const panelId = (panel as HTMLElement).id;
      
      // Apply saved height from settings if available
      if (panelId && this.settingsManager.appSettings.panel_heights[panelId]) {
        (panel as HTMLElement).style.height = `${this.settingsManager.appSettings.panel_heights[panelId]}px`;
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
              this.settingsManager.appSettings.panel_heights[panelId] = parseInt(window.getComputedStyle(panel).height, 10);
              this.settingsManager.saveSettings();
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
        const startWidth = this.settingsManager.appSettings.right_panel_width;
        
        function onMouseMove(moveEvent: MouseEvent) {
          // Calculate how much to resize based on mouse movement
          const dx = moveEvent.clientX - startX;
          const containerWidth = document.querySelector('.app-container')?.clientWidth || 0;
          const newWidth = Math.max(200, Math.min(containerWidth * 0.6, startWidth - dx));
          
          // Update CSS variable for right panel width
          document.documentElement.style.setProperty('--right-panel-width', `${newWidth}px`);
          this.settingsManager.appSettings.right_panel_width = newWidth;
        }
        
        function onMouseUp() {
          document.removeEventListener('mousemove', onMouseMove);
          document.removeEventListener('mouseup', onMouseUp);
          
          // Save the new width to settings
          this.settingsManager.saveSettings();
        }
        
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
      });
    }
  }
 
  // Launch game function
  public async launchGame() {
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

  /************************
   * Handles
   ************************/

  /**
   * Handles the game selected change.
   * @param {string} gameId - The id of the game.
   * @param {boolean} isChecked - Whether the game is checked.
   */
  public async handleGameSelectedChange(gameId: string, isChecked: boolean) {
    try {
      const [treeData, listData] = await invoke("handle_change_game_selected", { gameId: gameId }) as [TreeCategory[], ListItem[]];
      this.modTree.renderTree(this.settingsManager, this.packList, treeData);      
      this.packList.renderListItems(listData);
        
      // Expandir categorías guardadas
      Object.keys(this.settingsManager.appSettings.tree_open_state).forEach(categoryId => {
        if (this.settingsManager.appSettings.tree_open_state[categoryId]) {
          this.modTree.toggleCategoryExpansion(this.settingsManager, categoryId, true);
        }
      });
      
      // Restaurar el item seleccionado si existe
        if (this.settingsManager.appSettings.selected_tree_item) {
        this.modTree.selectTreeItem(this.settingsManager.appSettings.selected_tree_item);
      }
      
      // Update status bar with result
      const statusMessage = document.querySelector(".status-message");
      if (statusMessage) {
        //statusMessage.textContent = result as string;
      }
      
      // Save settings after change
      await this.settingsManager.saveSettings();
    } catch (error) {
      console.error("Failed to handle checkbox change:", error);
    }
  }

  // Handle item drop
  public async handleItemDrop(sourceId: string, targetId: string) {
    try {
      const result = await invoke("handle_item_drop", { sourceId, targetId });
      
      // Update status bar with result
      const statusMessage = document.querySelector(".status-message");
      if (statusMessage) {
        statusMessage.textContent = result as string;
      }
      
      // Reload tree data to reflect changes
      await this.modTree.renderTree(this.settingsManager, this.packList, treeData);
      
      // Save settings after change
      await this.settingsManager.saveSettings();
    } catch (error) {
      console.error("Failed to handle item drop:", error);
    }
  }
}

// Initialize the main instance once the DOM is loaded.
window.addEventListener("DOMContentLoaded", async () => {
  console.log('DOM fully loaded');
  
  try {
    // Notify Rust that the window is ready
    const response = await invoke('on_window_ready');
    console.log('Window ready notification sent to Rust:', response);
  } catch (error) {
    console.error('Error during window ready notification:', error);
  } 

  main = new Main();
});
