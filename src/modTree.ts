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
  private currentSortField: string = 'name';
  private sortDirection: 'asc' | 'desc' = 'asc';
  private categoriesOrder: string[];
  private dragCounter: number;
  private dragOverElement: HTMLElement | null;
  private draggingCategory: boolean;
      
  constructor(main: Main) {
    this.categoryElements = new Map();
    this.itemElements = new Map();
    this.treeFilterInput = document.getElementById('tree-filter') as HTMLInputElement;
    this.selectedItems = new Set<string>();
    this.categoriesOrder = [];
    this.dragCounter = 0;
    this.dragOverElement = null;
    this.draggingCategory = false;
    this.treeFilterInput.addEventListener('input', () => {
      this.filterTreeItems(main.settingsManager, this.treeFilterInput.value);
    });
  }
 
  /**
   * Clear and render the mod tree.
   * @param {Main} main - The main instance of the application.
   * @param {TreeCategory[]} categories - The categories to render.
   * 
   * TODO: Split this into two functions: one for the tree header, and one for the tree body.
   */
  public async renderTree(main: Main, categories: TreeCategory[]) {
    const treeContainer = document.getElementById('tree-container');
    if (!treeContainer) return;

    // Clear maps for filtering
    this.categoryElements.clear();
    this.itemElements.clear();
    
    treeContainer.innerHTML = '';
    
    // Reorderable headers.
    const treeHeader = document.createElement('div');
    treeHeader.className = 'tree-header';
    treeHeader.innerHTML = `
      <div class="header-column sortable" data-sort="name">Name <i class="fa-solid fa-sort"></i></div>
      <div class="header-column sortable" data-sort="type">Type <i class="fa-solid fa-sort"></i></div>
      <div class="header-column sortable" data-sort="creator">Creator <i class="fa-solid fa-sort"></i></div>
      <div class="header-column sortable" data-sort="size">Size <i class="fa-solid fa-sort"></i></div>
    `;
    
    // Add click events to the sortable columns
    const sortableColumns = treeHeader.querySelectorAll('.sortable');
    sortableColumns.forEach(column => {
      column.addEventListener('click', () => {
        const field = column.getAttribute('data-sort') || 'name';

        // FIXME: this causes issues when we sort after reordering or moving mods between categories.
        this.sortTreeItems(main, categories, field);
      });
    });
    
    treeContainer.appendChild(treeHeader);
    
    // Then render the categories and their items
    categories.forEach(category => {
      const categoryElement = document.createElement('div');
      categoryElement.className = 'tree-category';
      categoryElement.dataset.id = CSS.escape(category.id);
      this.setupDragCategory(categoryElement);

      // Empty drop element for categories inbetweeners.
      const emptyDropElement = document.createElement('div');
      emptyDropElement.className = 'empty-drop-element';
      categoryElement.appendChild(emptyDropElement);
      this.setupDrop(main, categoryElement);
      
      // Category header, with the expander and the name.
      const categoryHeader = document.createElement('div');
      categoryHeader.className = 'category-header';
      categoryHeader.innerHTML = `
        <span class="expander"><i class="fa-solid fa-chevron-right"></i></span>
        <span class="category-name">${category.id}</span>
      `;
      categoryHeader.addEventListener('click', () => {
        this.toggleCategoryExpansion(main.settingsManager, categoryElement.getAttribute('data-id') || '')
      });

      // Items container, where the mod items are listed.
      const itemsContainer = document.createElement('div');
      itemsContainer.className = 'category-items';
      itemsContainer.id = `children-${categoryElement.getAttribute('data-id')}`;
      
      // Sort the mod items (not the categories) by the current sort column.
      const sortedItems = [...category.children];
      this.sortItems(sortedItems, this.currentSortField, this.sortDirection);
      
      sortedItems.forEach(item => {
        const itemElement = document.createElement('div');
        itemElement.className = 'tree-item tree-child';
        itemElement.dataset.id = CSS.escape(item.id);
        itemElement.dataset.categoryId = categoryElement.getAttribute('data-id') || '';

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

        // Event for toggling a mod through its checkbox.
        const checkbox = itemElement.querySelector('.item-checkbox')?.getElementsByTagName('input')[0] as HTMLInputElement;
        if (checkbox) {
          checkbox.addEventListener('change', () => {
            this.handleModToggled(main, itemElement.getAttribute('data-id') || '', checkbox.checked);
          });
        }
        
        // Add drag and drop event listeners
        this.setupDragMod(main, itemElement);

        // Event for selecting an item.
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

        this.itemElements.set(itemElement.getAttribute('data-id') || '', itemElement);
      });
      
      categoryElement.appendChild(categoryHeader);
      categoryElement.appendChild(itemsContainer);

      // Empty drop element for mods at the end of categories.
      const emptyModDropElement = document.createElement('div');
      emptyModDropElement.className = 'empty-drop-element';
      categoryElement.appendChild(emptyModDropElement);
      this.setupDrop(main, categoryElement);

      treeContainer.appendChild(categoryElement);

      this.categoryElements.set(categoryElement.getAttribute('data-id') || '', categoryElement);

      if (main.settingsManager.appSettings.tree_open_state[category.id] === true) {
        this.toggleCategoryExpansion(main.settingsManager, category.id, true);
      }
    });

    this.updateSortIndicators();
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


  /**
   * Toggle category expansion, hiding or showing the mods it contains.
   * @param {SettingsManager} settingsManager - The settings manager instance.
   * @param {string} categoryId - The id of the category to toggle.
   * @param {boolean} forceState - If true, force the category to be expanded. If false, toggle the state of the category.
   */
  public async toggleCategoryExpansion(settingsManager: SettingsManager, categoryId: string, forceState?: boolean) {
    categoryId = CSS.escape(categoryId);

    const categoryElement = this.categoryElements.get(categoryId);
    if (!categoryElement) return;
    
    const childrenContainer = document.getElementById(`children-${categoryId}`);
    if (!childrenContainer) return;
    
    const isExpanded = categoryElement.classList.contains('expanded');
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

  /************************
   * Selection
   ************************/

  /**
   * Select a tree item.
   * @param {Main} main - The main instance of the application.
   * @param {string} itemId - The id of the item to select.
   * @param {boolean} isCtrlPressed - Whether Ctrl key is pressed (for multi-select).
   * @param {boolean} isShiftPressed - Whether Shift key is pressed (for range selection).
   */
  public selectTreeItem(main: Main, itemId: string, isCtrlPressed: boolean = false, isShiftPressed: boolean = false) {
    if (!isCtrlPressed && !isShiftPressed) {
      const currentlySelected = document.querySelectorAll('.tree-item.selected');
      currentlySelected.forEach(item => {
        item.classList.remove('selected');
      });
      this.selectedItems.clear();
    }
    
    const itemElement = this.itemElements.get(itemId);
    if (!itemElement) return;
    
    if (isShiftPressed && this.selectedItems.size > 0) {
      const items = Array.from(document.querySelectorAll('.tree-item'));
      const lastSelectedId = Array.from(this.selectedItems)[this.selectedItems.size - 1];
      const lastSelectedIndex = items.findIndex(item => item.getAttribute('data-id') === lastSelectedId);
      const currentIndex = items.findIndex(item => item.getAttribute('data-id') === itemId);
      
      const start = Math.min(lastSelectedIndex, currentIndex);
      const end = Math.max(lastSelectedIndex, currentIndex);
      
      for (let i = start; i <= end; i++) {
        const id = items[i].getAttribute('data-id');
        if (id) {
          this.selectedItems.add(id);
          items[i].classList.add('selected');
        }
      }
    } else if (isCtrlPressed) {
      if (this.selectedItems.has(itemId)) {
        this.selectedItems.delete(itemId);
        itemElement.classList.remove('selected');
      } else {
        this.selectedItems.add(itemId);
        itemElement.classList.add('selected');
      }
    } else {
      this.selectedItems.add(itemId);
      itemElement.classList.add('selected');
    }
    
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
      main.settingsManager.appSettings.selected_tree_item = itemId;
      main.settingsManager.saveSettings();
      this.showModDetails(itemId);
      
      this.syncListWithTreeSelection(main, itemId);
    } else if (this.selectedItems.size > 1) {
      this.showMultipleModsDetails(this.selectedItems);
    }
  }

  /**
   * Sync the tree selection with the pack list.
   * @param {Main} main - The main instance of the application.
   * @param {string} itemId - The id of the item selected.
   */
  private syncListWithTreeSelection(main: Main, itemId: string) {
    const itemElement = this.itemElements.get(itemId);
    if (!itemElement) return;
    
    const nameElement = itemElement.querySelector('.item-name');
    if (nameElement) {
      const modName = this.stripHtml(nameElement.innerHTML);
      
      const listItems = document.querySelectorAll('.list-item');
      for (const item of listItems) {
        const packName = item.children[0].textContent;
        if (packName && modName.includes(packName)) {
          main.packList.selectListItem(item.getAttribute('data-id') || '');
          break;
        }
      }
    }
  }

  /**
   * Highlight an item in the tree based on the pack name.
   * @param {string} packName - The name of the pack to highlight.
   */
  public highlightTreeItemByPack(packName: string) {
    const normalizedPackName = packName.toLowerCase();  
    let foundItem: string | null = null;
  
    this.itemElements.forEach((element, itemId) => {
      const itemNameElement = element.querySelector('.item-name');
      if (itemNameElement) {
        const itemText = this.stripHtml(itemNameElement.innerHTML).toLowerCase();   
        if (itemText.includes(normalizedPackName)) {
          foundItem = itemId;
        }
      }
    });
    
    if (foundItem) {
      this.selectTreeItem(
        { settingsManager: { appSettings: {}, saveSettings: () => {} } } as Main, 
        foundItem,
        false,
        false
      );
    }
  }

  /************************
   * Drag and Drop
   ************************/
 
  /**
   * Setup drag event for categories
   * @param {HTMLElement} element - The category element to setup drag for
   */
  private async setupDragCategory(element: HTMLElement) {
    element.setAttribute('draggable', 'true');

    element.addEventListener("dragstart", (e) => {
      this.draggingCategory = true;
      e.stopPropagation();
      
      e.dataTransfer?.setData("text/plain", "category:" + (element.dataset.id || ''));     
      element.classList.add("dragging");
    });

    element.addEventListener("dragend", () => {
      element.classList.remove("dragging");
    });
  }

  /**
   * Setup drag event for mods
   * @param {Main} main - The main instance of the application
   * @param {HTMLElement} element - The mod element to setup drag for
   */
  private async setupDragMod(main: Main, element: HTMLElement) {
    element.setAttribute('draggable', 'true');

    element.addEventListener("dragstart", (e) => {
      this.dragCounter = 0;
      this.draggingCategory = false;

      // Do not propagate the event to the parent, if it has a parent. Otherwise this triggers a double event.
      e.stopPropagation();
      
      if (!this.selectedItems.has(element.dataset.id || '')) {
        this.selectTreeItem(
          main, 
          element.dataset.id || '',
          e.ctrlKey,
          e.shiftKey
        );
      }

      const selectedIds = Array.from(this.selectedItems).join(',');
      e.dataTransfer?.setData("text/plain", selectedIds);
      this.setupDragging(element);
    });

    element.addEventListener("dragend", () => {
      this.removeDragging(element);

      // Cleanup any remaining drag-over elements, as this can happen outside the dragover element 
      // and we don't have another way to clean them up.
      if (this.dragOverElement !== null) {
        this.removeDragOver(this.dragOverElement);
        this.dragOverElement = null;
      }
    });
  }

  /**
   * Setup the dragging state for an element. Supports categories and mods.
   * @param {HTMLElement} element - The element to setup dragging for
   */
  private setupDragging(element: HTMLElement) {
    element.classList.add("dragging");
      
    if (!element.classList.contains('tree-category')) {
      this.selectedItems.forEach(id => {
        const el = this.itemElements.get(id);
        if (el) el.classList.add("dragging");
      });
    }
  }

  /**
   * Remove the dragging state for an element. Supports categories and mods.
   * @param {HTMLElement} element - The element to remove dragging for
   */
  private removeDragging(element: HTMLElement) {
    element.classList.remove("dragging");
    
    if (!element.classList.contains('tree-category')) {
      this.selectedItems.forEach(id => {
        const el = this.itemElements.get(id);
        if (el) el.classList.remove("dragging");
      });
    }
  }

  /**
   * Setup the drag-over state for an element. Supports categories and mods.
   * @param {HTMLElement} element - The element to setup drag-over for
   */
  private setupDragOver(element: HTMLElement) {
    if (element.classList.contains('tree-category')) {
      if (this.draggingCategory) {
        const emptyElement = element.firstChild as HTMLElement;
        if (!emptyElement.classList.contains('drag-over')) {
          emptyElement.classList.add('drag-over');
        }
      } else {
        const emptyElement = element.lastChild as HTMLElement;
        if (!emptyElement.classList.contains('drag-over')) {
          emptyElement.classList.add('drag-over');
        }
      }
    }

    if (!element.classList.contains('drag-over')) {
      element.classList.add("drag-over");
    }
  }

  /**
   * Remove the drag-over state for an element. Supports categories and mods.
   * @param {HTMLElement} element - The element to remove drag-over for
   */
  private removeDragOver(element: HTMLElement) {
    if (element.classList.contains('tree-category')) {
      if (this.draggingCategory) {
        const emptyElement = element.firstChild as HTMLElement;
        emptyElement.classList.remove('drag-over');
      } else {
        const emptyElement = element.lastChild as HTMLElement;
        emptyElement.classList.remove('drag-over');
      }
    }
    element.classList.remove("drag-over");
  }

  /**
   * Setup drop listeners for an element.
   * @param {Main} main - The main instance of the application
   * @param {HTMLElement} element - The element to setup drag and drop for
   */
  private async setupDrop(main: Main, element: HTMLElement) {

    // NOTE: dragenter is called twice. Why? Nested draggable divs. Anyway, to avoid the double call causing problems,
    // we have to store the element in the dragOverElement variable and check if we actually moved to another element.
    element.addEventListener("dragenter", () => {
      this.dragCounter++;

      if (this.dragOverElement === null) {
        this.dragOverElement = element;
      } else if (this.dragOverElement.getAttribute('data-id') !== element.getAttribute('data-id')) {
        this.removeDragOver(this.dragOverElement);
        this.dragOverElement = element;
      }

      this.setupDragOver(element);
    });

    element.addEventListener("dragover", (e) => {
      this.setupDragOver(element);
      e.preventDefault();
    });
    
    // NOTE: dragEnter already controls when the element should have a drag-over state. 
    // This is just for the situation where we leave the element and the new one is not a dropzone.
    element.addEventListener("dragleave", () => {
      this.dragCounter--;

      if (this.dragCounter === 0 && this.dragOverElement) {
        this.removeDragOver(this.dragOverElement);
        this.dragOverElement = null;
      }
    });
    
    element.addEventListener("drop", (e) => {
      this.removeDragOver(element);
      e.preventDefault();

      const sourceData = e.dataTransfer?.getData("text/plain");
      const targetId = element.dataset.id;

      // If the sourceData starts with "category:", it's a category being dragged.
      if (sourceData && sourceData.startsWith("category:")) {
        const sourceId = sourceData.replace("category:", "");
        if (targetId && sourceId !== targetId) {
          this.handleCategoryReorder(main, sourceId, targetId);
        }
      } 
      
      // Otherwise, it's a mod being dragged.
      else {
        const sourceIds = sourceData ? sourceData.split(',') : [];
        if (targetId && sourceIds.length > 0) {
          this.handleModDrop(main, sourceIds, targetId);
        }
      }
    });
  }

  /************************
   * Sorting
   ************************/

  /**
   * Sort the items of the last level of the tree and re-render.
   * @param {Main} main - The main instance of the application.
   * @param {TreeCategory[]} categories - The categories to sort.
   * @param {string} field - The field to sort by.
   */
  private sortTreeItems(main: Main, categories: TreeCategory[], field: string) {
    if (this.currentSortField === field) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.currentSortField = field;
      this.sortDirection = 'asc';
    }
    
    // Re-render the tree with the sorted items
    this.renderTree(main, categories);
  }
  
  /**
   * Update the sort indicators in the headers.
   */
  private updateSortIndicators() {
    const headers = document.querySelectorAll('.header-column.sortable');
    headers.forEach(header => {
      const field = header.getAttribute('data-sort') || '';
      const icon = header.querySelector('i');
      
      if (field === this.currentSortField) {
        icon?.classList.remove('fa-sort');
        icon?.classList.add(this.sortDirection === 'asc' ? 'fa-sort-up' : 'fa-sort-down');
      } else {
        icon?.classList.remove('fa-sort-up', 'fa-sort-down');
        icon?.classList.add('fa-sort');
      }
    });
  }
  
  /**
   * Sort an array of items by a specific field.
   * @param {TreeItem[]} items - The items to sort.
   * @param {string} field - The field to sort by.
   * @param {'asc' | 'desc'} direction - The direction of sorting.
   */
  private sortItems(items: TreeItem[], field: string, direction: 'asc' | 'desc') {
    items.sort((a, b) => {
      let valueA: string | number = '';
      let valueB: string | number = '';
      
      switch (field) {
        case 'name':
          valueA = this.stripHtml(a.name).toLowerCase();
          valueB = this.stripHtml(b.name).toLowerCase();
          break;
        case 'type':
          valueA = (a.type || '').toLowerCase();
          valueB = (b.type || '').toLowerCase();
          break;
        case 'creator':
          valueA = (a.creator || '').toLowerCase();
          valueB = (b.creator || '').toLowerCase();
          break;
        case 'size':
          valueA = this.parseSize(a.size);
          valueB = this.parseSize(b.size);
          break;
        default:
          valueA = (a.name || '').toLowerCase();
          valueB = (b.name || '').toLowerCase();
      }
      
      if (valueA < valueB) {
        return direction === 'asc' ? -1 : 1;
      }
      if (valueA > valueB) {
        return direction === 'asc' ? 1 : -1;
      }
      return 0;
    });
  }
  
  /************************
   * Handles
   ************************/

  /**
   * Handle category reordering
   * @param {Main} main - The main instance of the application
   * @param {string} sourceId - The source category ID
   * @param {string} targetId - The target category ID
   */
  public async handleCategoryReorder(main: Main, sourceId: string, targetId: string) {
    try {
      main.statusMessage.textContent = `Reordering categories...`;
      this.categoriesOrder = await invoke("reorder_categories", { sourceId, targetId });
      
      const sourceCat = this.categoryElements.get(sourceId);
      const targetCat = this.categoryElements.get(targetId);
      
      if (sourceCat && targetCat) {
        const container = sourceCat.parentNode;
        if (container) {
          container.insertBefore(sourceCat, targetCat);
        }
      }
      
      main.statusMessage.textContent = `Categories reordered successfully`;
    } catch (error) {
      console.error("Failed to reorder categories:", error);
      main.statusMessage.textContent = `Error reordering categories: ${error}`;
    }
  }

  /**
   * Handle toggling a mod through its checkbox.
   * @param {Main} main - The main instance of the application.
   * @param {string} itemId - The id of the item to change.
   * @param {boolean} isChecked - The new state of the checkbox.
   */
  public async handleModToggled(main: Main, itemId: string, isChecked: boolean) {
    try {
      const listData = await invoke('handle_mod_toggled', { 
        modId: itemId.replace(/\\/g, ''), 
        isChecked: isChecked 
      }) as ListItem[];

      main.packList.renderListItems(main, listData);
    } catch (error) {
      console.error('Failed to handle mod toggled:', error);
    }
  }

  /**
   * Handle multiple items being dropped
   * @param {Main} main - The main instance of the application
   * @param {string[]} sourceIds - Array of source item IDs
   * @param {string} targetId - Target item ID
   */
  public async handleModDrop(main: Main, sourceIds: string[], targetId: string) {
    try {
      main.statusMessage.textContent = `Moving ${sourceIds.length} mods...`;
      
      // FIXME: Get the category returned from the backend and use it to rebuild the category node with the correct order.
      const movedIds = sourceIds.filter(sourceId => sourceId !== targetId);
      await invoke("handle_mod_category_change", { modIds: movedIds, categoryId: targetId });

      // By default, we don't move anything in the UI. Instead we move it in the backend, and if it works, 
      // we manually search the entries in the tree and move them.
      const target = this.categoryElements.get(targetId);
      if (!target) return;

      const targetContainer = target.querySelector('.category-items');
      if (!targetContainer) return;

      // Mods are added at the end of the target category. 
      for (const sourceId of sourceIds) {
        const itemElement = this.itemElements.get(sourceId);
        if (itemElement && itemElement.dataset.categoryId !== targetId) {
          itemElement.dataset.categoryId = targetId;
          targetContainer.appendChild(itemElement);
        }
      }

      main.statusMessage.textContent = `${sourceIds.length} mods moved successfully`;
    } catch (error) {
      console.error("Failed to handle items drop:", error);
    }
  }

  /************************
   * Mod details
   ************************/

  /**
   * Show mod details.
   * @param {string} itemId - The id of the mod to show details for.
   */
  public showModDetails(itemId: string) {
    const modDetails = document.getElementById('mod-details');
    if (!modDetails) return;
        
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
          
          modDetails.innerHTML = details;
        }
      }
    });
  }

  /**
   * Display details for multiple selected mods.
   * @param {Set<string>} selectedIds - Set of selected mod IDs
   */
  private showMultipleModsDetails(selectedIds: Set<string>) {
    const modDetails = document.getElementById('mod-details');
    if (!modDetails) return;
    
    const count = selectedIds.size;
    modDetails.innerHTML = `
      <div class="detail-item">
        <strong>${count} mods selected</strong>
      </div>
      <div class="detail-item">
        <p>You can drag the selected mods to another category.</p>
      </div>
    `;
  }

  /************************
   * Utils
   ************************/

  /**
   * Remove HTML tags from a string.
   * @param {string} html - The string with HTML tags.
   * @returns {string} - The string without HTML tags.
   */
  private stripHtml(html: string): string {
    const tmp = document.createElement('DIV');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
  }
  
  /**
   * Convert a size string (e.g. "10.5 MB") to a comparable number.
   * @param {string} sizeStr - The size string.
   * @returns {number} - The size in bytes.
   */
  private parseSize(sizeStr: string): number {
    if (!sizeStr) return 0;
    
    const match = sizeStr.match(/(\d+(\.\d+)?) (KB|MB|GB)/i);
    if (!match) return 0;
    
    const size = parseFloat(match[1]);
    const unit = match[3].toUpperCase();
    
    switch (unit) {
      case 'KB':
        return size * 1024;
      case 'MB':
        return size * 1024 * 1024;
      case 'GB':
        return size * 1024 * 1024 * 1024;
      default:
        return size;
    }
  }
}