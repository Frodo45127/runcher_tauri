import { invoke } from "@tauri-apps/api/core";
import { Main } from "./main";
import { ListItem } from "./packList";
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
  private selectedItems: Set<string>;
      
  constructor(main: Main) {
    this.categoryElements = new Map();
    this.itemElements = new Map();
    this.treeFilterInput = document.getElementById('tree-filter') as HTMLInputElement;
    this.selectedItems = new Set<string>();

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
      this.setupDrop(main, categoryElement);
        
      // Evento para seleccionar item
      //categoryElement.addEventListener('click', (e) => {
      //  this.selectTreeItem(
      //    main, 
      //    categoryElement.getAttribute('data-id') || '',
      //    e.ctrlKey,
      //    e.shiftKey
      //  );
      //});

      // Hacer que los elementos sean arrastrables
      //categoryElement.setAttribute('draggable', 'true');

      const categoryHeader = document.createElement('div');
      categoryHeader.className = 'category-header';
      categoryHeader.innerHTML = `
        <span class="expander"><i class="fa-solid fa-chevron-right"></i></span>
        <span class="category-name">${category.id}</span>
      `;
      categoryHeader.addEventListener('click', () => {
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
            this.handleCheckboxChange(main, itemElement.getAttribute('data-id') || '', checkbox.checked);
          });
        }
        
        // Add drag and drop event listeners
        this.setupDrag(main, itemElement);

        // Evento para seleccionar item
        itemContent.addEventListener('click', (e) => {
          if (e.target !== checkbox) {
            this.selectTreeItem(
              main, 
              itemElement.getAttribute('data-id') || '',
              e.ctrlKey,
              e.shiftKey
            );
          }
        });

        // Hacer que los elementos sean arrastrables
        itemElement.setAttribute('draggable', 'true');

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

    this.filterTreeItems(main.settingsManager, main.settingsManager.appSettings.tree_filter_value);
  }

  /**
   * Filter tree items based on search text.
   * @param {SettingsManager} settingsManager - The settings manager instance.
   * @param {string} searchText - The text to filter the tree items.
   */
  public async filterTreeItems(settingsManager: SettingsManager, searchText: string) {
    const normalizedSearchText = searchText.toLowerCase().trim();
    settingsManager.appSettings.tree_filter_value = normalizedSearchText;
    settingsManager.saveSettings();

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
  public async setupDrag(main: Main, element: HTMLElement) {
    element.addEventListener("dragstart", (e) => {
      const selectedIds = Array.from(this.selectedItems).join(',');
      e.dataTransfer?.setData("text/plain", selectedIds);

      if (!this.selectedItems.has(element.dataset.id || '')) {
        this.selectTreeItem(
          main, 
          element.dataset.id || '',
          false,
          false
        );
      }
      
      element.classList.add("dragging");
      
      this.selectedItems.forEach(id => {
        const el = this.itemElements.get(id);
        if (el) el.classList.add("dragging");
      });

      // Do not propagate the event to the parent, if it has a parent. Otherwise this triggers a double event.
      e.stopPropagation();
    });

    element.addEventListener("dragend", () => {
      element.classList.remove("dragging");

      this.selectedItems.forEach(id => {
        const el = this.itemElements.get(id);
        if (el) el.classList.remove("dragging");
      });
    });
  }

  
  // Setup drag and drop for an element
  public async setupDrop(main: Main, element: HTMLElement) {

    // Drag over event
    element.addEventListener("dragover", (e) => {
      e.preventDefault();
      (e.dataTransfer as DataTransfer).dropEffect = "move";

      element.classList.add("drag-over");
    });
    
    // Drag leave event
    element.addEventListener("dragleave", (e) => {
      element.classList.remove("drag-over");
    });
    
    // Drop event
    element.addEventListener("drop", (e) => {
      e.preventDefault();

      element.classList.remove("drag-over");

      const sourceIds = e.dataTransfer?.getData("text/plain").split(',');
      const targetId = element.dataset.id;
      
      if (sourceIds && targetId && sourceIds.length > 0) {
        this.handleMultipleItemsDrop(main, sourceIds, targetId);
      }
    });
  }

  /**
   * Select a tree item.
   * @param {Main} main - The main instance of the application.
   * @param {string} itemId - The id of the item to select.
   * @param {boolean} isCtrlPressed - Whether Ctrl key is pressed (for multi-select).
   * @param {boolean} isShiftPressed - Whether Shift key is pressed (for range selection).
   */
  public selectTreeItem(main: Main, itemId: string, isCtrlPressed: boolean = false, isShiftPressed: boolean = false) {
    // Implementar lógica de selección múltiple
    if (!isCtrlPressed && !isShiftPressed) {
      // Selección normal: quitar selección de todos los demás ítems
      const currentlySelected = document.querySelectorAll('.tree-item.selected');
      currentlySelected.forEach(item => {
        item.classList.remove('selected');
      });
      this.selectedItems.clear();
    }
    
    const itemElement = this.itemElements.get(itemId);
    if (!itemElement) return;
    
    if (isShiftPressed && this.selectedItems.size > 0) {
      // Selección por rango: seleccionar todos los ítems entre el último y este
      const items = Array.from(document.querySelectorAll('.tree-item'));
      const lastSelectedId = Array.from(this.selectedItems)[this.selectedItems.size - 1];
      const lastSelectedIndex = items.findIndex(item => item.getAttribute('data-id') === lastSelectedId);
      const currentIndex = items.findIndex(item => item.getAttribute('data-id') === itemId);
      
      // Determinar el rango (inicio y fin)
      const start = Math.min(lastSelectedIndex, currentIndex);
      const end = Math.max(lastSelectedIndex, currentIndex);
      
      // Seleccionar todos los ítems en el rango
      for (let i = start; i <= end; i++) {
        const id = items[i].getAttribute('data-id');
        if (id) {
          this.selectedItems.add(id);
          items[i].classList.add('selected');
        }
      }
    } else if (isCtrlPressed) {
      // Selección con Ctrl: toggle selección para este ítem
      if (this.selectedItems.has(itemId)) {
        this.selectedItems.delete(itemId);
        itemElement.classList.remove('selected');
      } else {
        this.selectedItems.add(itemId);
        itemElement.classList.add('selected');
      }
    } else {
      // Selección simple de un elemento
      this.selectedItems.add(itemId);
      itemElement.classList.add('selected');
    }
    
    // Asegurar que la categoría esté expandida
    const categoryContainer = itemElement.closest('.tree-category');
    if (categoryContainer) {
      const categoryId = categoryContainer.getAttribute('data-id');
      if (categoryId) {
        const categoryItems = categoryContainer.querySelector('.category-items');
        if (categoryItems && categoryItems.classList.contains('hidden')) {
          this.toggleCategoryExpansion(main.settingsManager, categoryId);
        }
      }
    }
    
    if (this.selectedItems.size === 1) {
      // Si solo hay un elemento seleccionado, actualizar configuración y mostrar detalles
      main.settingsManager.appSettings.selected_tree_item = itemId;
      main.settingsManager.saveSettings();
      this.showItemDetails(itemId);
    } else if (this.selectedItems.size > 1) {
      // Si hay múltiples elementos seleccionados, mostrar información sobre selección múltiple
      this.showMultipleItemsDetails(this.selectedItems);
    }
  }

  /**
   * Show item details.
   * @param {string} itemId - The id of the item to show details for.
   */
  public showItemDetails(itemId: string) {
    const gameDetails = document.getElementById('game-details');
    if (!gameDetails) return;
        
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

  /**
   * Display details for multiple selected items
   * @param {Set<string>} selectedIds - Set of selected item IDs
   */
  private showMultipleItemsDetails(selectedIds: Set<string>) {
    const gameDetails = document.getElementById('game-details');
    if (!gameDetails) return;
    
    const count = selectedIds.size;
    gameDetails.innerHTML = `
      <div class="detail-item">
        <strong>${count} elementos seleccionados</strong>
      </div>
      <div class="detail-item">
        <p>Puede arrastrar los elementos seleccionados a otra categoría.</p>
      </div>
    `;
  }

  /**
   * Handle checkbox change (mod toggling).
   * @param {Main} main - The main instance of the application.
   * @param {string} itemId - The id of the item to change.
   * @param {boolean} isChecked - The new state of the checkbox.
   */
  public async handleCheckboxChange(main: Main, itemId: string, isChecked: boolean) {
    try {
      // Llamar a la función Rust para manejar el cambio del checkbox
      const listData = await invoke('handle_checkbox_change', { 
        modId: itemId.replace(/\\/g, ''), 
        isChecked: isChecked 
      }) as ListItem[];

      main.packList.renderListItems(main, listData);
    
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
      //await this.renderTree(main, treeData);
      
      // Save settings after change
      await main.settingsManager.saveSettings();
    } catch (error) {
      console.error("Failed to handle item drop:", error);
    }
  }

  /**
   * Handle multiple items being dropped
   * @param {Main} main - The main instance of the application
   * @param {string[]} sourceIds - Array of source item IDs
   * @param {string} targetId - Target item ID
   */
  public async handleMultipleItemsDrop(main: Main, sourceIds: string[], targetId: string) {
    try {
      // Mostrar mensaje de estado
      const statusMessage = document.querySelector(".status-message");
      if (statusMessage) {
        statusMessage.textContent = `Moviendo ${sourceIds.length} elementos...`;
      }
      
      // Procesar cada elemento
      const movedIds = sourceIds.filter(sourceId => sourceId !== targetId);
      await invoke("handle_item_drop", { sourceIds: movedIds, targetId });

      // By default, we don't move anything in the UI. Instead we move it in the backend, and if it works, 
      // we manually search the entries in the tree and move them.
      const target = this.categoryElements.get(targetId);
      if (!target) return;

      for (const sourceId of sourceIds) {
        const itemElement = this.itemElements.get(sourceId);
        if (itemElement) {
          target.appendChild(itemElement);
        }
      }

      // Actualizar mensaje de estado
      if (statusMessage) {
        statusMessage.textContent = `${sourceIds.length} elementos movidos exitosamente`;
      }
    } catch (error) {
      console.error("Failed to handle items drop:", error);
    }
  }
}