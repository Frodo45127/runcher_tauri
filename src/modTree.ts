import { invoke } from "@tauri-apps/api/core";
import { Main } from "./main";
import { ListItem, PackList } from "./packList";
import { SettingsManager } from "./settings";

export interface TreeItem {
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

export interface TreeCategory {
  id: string;
  name: string;
  size: string;
  status: string;
  last_played: string;
  children: TreeItem[];
}

export class ModTree {
  private categoryElements: Map<string, HTMLElement>;
  private itemElements: Map<string, HTMLElement>;
  private treeFilterInput: HTMLInputElement;
      
  constructor(main: Main) {
    this.categoryElements = new Map();
    this.itemElements = new Map();
    this.treeFilterInput = document.getElementById('tree-filter') as HTMLInputElement;

    this.treeFilterInput.addEventListener('input', () => {
      this.filterTreeItems(main.settingsManager, this.treeFilterInput.value);
    });
  }
 
  /**
   * Clear and render the mod tree.
   * @param {Main} main - The main instance of the application.
   * @param {TreeCategory[]} categories - The categories to render.
   */
  public async renderTree(main: Main, categories: TreeCategory[]) {
    const treeContainer = document.getElementById('tree-container');
    if (!treeContainer) return;

    // Clear maps for filtering
    this.categoryElements.clear();
    this.itemElements.clear();
    
    treeContainer.innerHTML = '';
    
    categories.forEach(category => {
      const categoryElement = document.createElement('div');
      categoryElement.className = 'tree-category';
      categoryElement.dataset.id = CSS.escape(category.id);

      // Add drag and drop event listeners
      this.setupDragAndDrop(main, categoryElement);

      const categoryHeader = document.createElement('div');
      categoryHeader.className = 'category-header';
      categoryHeader.innerHTML = `
        <span class="expander"><i class="fa-solid fa-chevron-right"></i></span>
        <span class="category-name">${category.id}</span>
      `;
      categoryHeader.addEventListener('click', () => {
        console.log(categoryElement.getAttribute('data-id'));
        this.toggleCategoryExpansion(main.settingsManager, categoryElement.getAttribute('data-id') || '')
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
        
        // Append them before adding listeners, or the selectors won't work.
        itemElement.appendChild(itemContent);
        itemsContainer.appendChild(itemElement);

        // Evento para manejo de checkbox
        const checkbox = itemElement.querySelector('.item-checkbox')?.getElementsByTagName('input')[0] as HTMLInputElement;
        if (checkbox) {
          checkbox.addEventListener('change', () => {
            this.handleCheckboxChange(main.packList, itemElement.getAttribute('data-id') || '', checkbox.checked);
          });
        }
        
        // Add drag and drop event listeners
        this.setupDragAndDrop(main, itemElement);

        // Evento para seleccionar item
        itemContent.addEventListener('click', (e) => {
          if (e.target !== checkbox) {
            this.selectTreeItem(main, itemElement.getAttribute('data-id') || '');
          }
        });

        this.itemElements.set(itemElement.getAttribute('data-id') || '', itemElement);
      });
      
      categoryElement.appendChild(categoryHeader);
      categoryElement.appendChild(itemsContainer);
      treeContainer.appendChild(categoryElement);

      this.categoryElements.set(categoryElement.getAttribute('data-id') || '', categoryElement);

      if (main.settingsManager.appSettings.tree_open_state[category.id] === true) {
        this.toggleCategoryExpansion(main.settingsManager, category.id, true);
      }
    });
  }

  /**
   * Filter tree items based on search text.
   * @param {SettingsManager} settingsManager - The settings manager instance.
   * @param {string} searchText - The text to filter the tree items.
   */
  public async filterTreeItems(settingsManager: SettingsManager, searchText: string) {
    const normalizedSearchText = searchText.toLowerCase().trim();
    settingsManager.appSettings.tree_filter_value = normalizedSearchText;
    
    // If search text is empty, show all items
    if (normalizedSearchText === '') {
      this.categoryElements.forEach(element => element.classList.remove('hidden'));
      this.itemElements.forEach(element => element.classList.remove('hidden'));
      document.querySelectorAll('.category-items').forEach(
        element => element.classList.remove('hidden')
      );
      return;
    }
    
    // First, hide all items
    this.categoryElements.forEach(element => element.classList.add('hidden'));
    this.itemElements.forEach(element => element.classList.add('hidden'));
    document.querySelectorAll('.category-items').forEach(
      element => element.classList.add('hidden')
    );
    
    // Keep track of categories that need to be shown
    const categoriesToShow = new Set<string>();

    // Check each game element
    this.itemElements.forEach(element => {
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
      const categoryElement = this.categoryElements.get(categoryId);
      if (categoryElement) {
        categoryElement.classList.remove('hidden');
        // Make sure the category is expanded
        this.toggleCategoryExpansion(settingsManager, categoryId, true);
      }
    });
    
    // Also check category names for matches
    this.categoryElements.forEach((element, categoryId) => {
      const categoryName = element.dataset.name || '';
      
      if (categoryName.includes(normalizedSearchText)) {
        // Show this category
        element.classList.remove('hidden');
        
        // Show its container and children
        const childrenContainer = document.getElementById(`children-${categoryId}`);
        if (childrenContainer) {
          childrenContainer.classList.remove('hidden');
          // Make sure the category is expanded
          this.toggleCategoryExpansion(settingsManager, categoryId, true);
        }
        
        // Show all its children
        this.itemElements.forEach((itemElement) => {
          if (itemElement.dataset.categoryId === categoryId) {
            itemElement.classList.remove('hidden');
          }
        });
      }
    });
  }


  // Toggle category expansion
  public async toggleCategoryExpansion(settingsManager: SettingsManager, categoryId: string, forceState?: boolean) {
    categoryId = CSS.escape(categoryId);

    const categoryElement = this.categoryElements.get(categoryId);
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
    settingsManager.appSettings.tree_open_state[categoryId] = newState;
    settingsManager.saveSettings();
  }

  // Setup drag and drop for an element
  public async setupDragAndDrop(main: Main, element: HTMLElement) {
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
        this.handleItemDrop(main, sourceId, targetId);
      }
    });
  }
/*
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
*/
  /**
   * Handle checkbox change (mod toggling).
   * @param {PackList} packList - The pack list instance.
   * @param {string} itemId - The id of the item to change.
   * @param {boolean} isChecked - The new state of the checkbox.
   */
  public async handleCheckboxChange(packList: PackList, itemId: string, isChecked: boolean) {
    try {
      // Llamar a la función Rust para manejar el cambio del checkbox
      const listData = await invoke('handle_checkbox_change', { 
        modId: itemId.replace(/\\/g, ''), 
        isChecked: isChecked 
      }) as ListItem[];

      packList.renderListItems(listData);
    
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
  public async handleItemDrop(main: Main, sourceId: string, targetId: string) {
    try {
      const result = await invoke("handle_item_drop", { sourceId, targetId });
      
      // Update status bar with result
      const statusMessage = document.querySelector(".status-message");
      if (statusMessage) {
        statusMessage.textContent = result as string;
      }
      
      // Reload tree data to reflect changes
      await this.renderTree(main, treeData);
      
      // Save settings after change
      await main.settingsManager.saveSettings();
    } catch (error) {
      console.error("Failed to handle item drop:", error);
    }
  }
}