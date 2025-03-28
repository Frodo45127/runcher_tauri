import { invoke } from "@tauri-apps/api/core";
import { SettingsManager } from "./settings";
import { Main } from "./main";

/**
 * This file contains the functions for the pack list.
 */

export interface ListItem {
  id: string;
  pack: string;
  type: string;
  order: number;
  location: string;
  steam_id: string;
}

const enum LoadOrderDirectionMove {
  Up = "Up",
  Down = "Down",
}

export class PackList {
  private listHeader: HTMLElement;
  private listContainer: HTMLElement;
  private listElements: Map<string, HTMLElement>;
  private listFilterInput: HTMLInputElement;
  private currentSortField: string = 'order';
  private sortDirection: 'asc' | 'desc' = 'asc';
  private dragCounter: number;
  private dragOverElement: HTMLElement | null;
  private dragOverTimeout: number | null;

  constructor(main: Main) {
    this.listElements = new Map();
    this.listFilterInput = document.getElementById('list-filter') as HTMLInputElement;
    this.listHeader = document.querySelector('.list-header') as HTMLElement;
    this.listContainer = document.getElementById('list-items-container') as HTMLElement;
    this.dragCounter = 0;
    this.dragOverElement = null;
    this.dragOverTimeout = null;

    this.listFilterInput.addEventListener('input', () => {
      this.filterListItems(main.settingsManager, this.listFilterInput.value);
    });
    
    this.setupSortEvents(main);
  } 

  /**
   * Configure sort events for the list headers.
   * @param {Main} main - The main instance of the application.
   */
  private setupSortEvents(main: Main) {
    this.listHeader.innerHTML = `
      <div class="header-column sortable" data-sort="pack">Mod <i class="fa-solid fa-sort"></i></div>
      <div class="header-column sortable" data-sort="type">Type <i class="fa-solid fa-sort"></i></div>
      <div class="header-column sortable" data-sort="order">Order <i class="fa-solid fa-sort"></i></div>
      <div class="header-column sortable" data-sort="location">Location <i class="fa-solid fa-sort"></i></div>
    `;
    
    const sortableColumns = this.listHeader.querySelectorAll('.sortable');
    sortableColumns.forEach(column => {
      column.addEventListener('click', (e) => {
        const field = (e.currentTarget as HTMLElement).getAttribute('data-sort') || 'order';
        this.sortListItems(main, field);
      });
    });
  }

  /**
   *  Render list items.
   * @param {Main} main - The main instance of the application.
   * @param {ListItem[]} listData - The list data to render.
   */ 
  public renderPackList(main: Main, listData: ListItem[]) {   
    this.listContainer.innerHTML = "";
    this.listElements.clear();
    
    const sortedItems = [...listData];
    this.sortItems(sortedItems, this.currentSortField, this.sortDirection);
    
    sortedItems.forEach(item => {
      const listItem = document.createElement("div");
      listItem.className = "list-item";
      listItem.dataset.id = item.id;
      listItem.dataset.pack = item.pack;
      listItem.dataset.type = item.type;
      listItem.dataset.order = item.order.toString();
      listItem.dataset.location = item.location;
      
      listItem.innerHTML = `
        <div>${item.pack}</div>
        <div>${item.type}</div>
        <div class="order-container">
          <span class="order-number">${item.order}</span>
          <div class="move-buttons">
            <button class="move-up-btn" title="Mover arriba"><i class="fa-solid fa-chevron-up"></i></button>
            <button class="move-down-btn" title="Mover abajo"><i class="fa-solid fa-chevron-down"></i></button>
          </div>
        </div>
        <div>${item.location}</div>
      `;
      
      listItem.addEventListener("click", (e) => {
        if (
          (e.target as HTMLElement).classList.contains('move-up-btn') || 
          (e.target as HTMLElement).classList.contains('move-down-btn') ||
          (e.target as HTMLElement).closest('.move-up-btn') || 
          (e.target as HTMLElement).closest('.move-down-btn')
        ) {
          return;
        }
        
        document.querySelectorAll(".list-item").forEach(item => 
          item.classList.remove("selected")
        );
        listItem.classList.add("selected");
        
        // Sync with the mod tree
        this.syncWithTreeSelection(main, item.pack);
      });
      
      const moveUpBtn = listItem.querySelector('.move-up-btn');
      const moveDownBtn = listItem.querySelector('.move-down-btn');
      
      if (moveUpBtn) {
        moveUpBtn.addEventListener('click', () => {
          this.movePackInLoadOrderInDirection(main, item.id, LoadOrderDirectionMove.Up);
        });
      }
      
      if (moveDownBtn) {
        moveDownBtn.addEventListener('click', () => {
          this.movePackInLoadOrderInDirection(main, item.id, LoadOrderDirectionMove.Down);
        });
      }
      
      this.setupDragDrop(main, listItem);
      
      this.listContainer.appendChild(listItem);
      this.listElements.set(item.id, listItem);
    });

    this.updateSortIndicators();    
    this.filterListItems(main.settingsManager, main.settingsManager.appSettings.list_filter_value);
  }
  
  /************************
   * Drag and drop
   ************************/

  /**
   * Configure drag and drop for list items.
   * @param {Main} main - The main instance of the application.
   * @param {HTMLElement} element - The element to which the events will be applied.
   */
  private setupDragDrop(main: Main, element: HTMLElement) {
    let dragOverTimeout: number | null = null;

    element.setAttribute('draggable', 'true');
    element.addEventListener('dragstart', (e) => {
      this.setupDragging(element);
      e.dataTransfer?.setData('text/plain', element.dataset.id || '');
      
      // Add a lift effect to the element that is being dragged
      element.style.zIndex = '1000';
    });
    
    element.addEventListener('dragend', () => {
      this.removeDragging(element);
      element.style.zIndex = '';
      
      // Clean any pending timeout
      if (dragOverTimeout) {
        clearTimeout(dragOverTimeout);
        dragOverTimeout = null;
      }
    });

    element.addEventListener("dragenter", () => {
    });
    
    element.addEventListener('dragover', (e) => {
      e.preventDefault();

      // Clean previous timeout if exists
      if (dragOverTimeout) {
        clearTimeout(dragOverTimeout);
      }
      
      // Add the class with a small delay to avoid flickering
      dragOverTimeout = window.setTimeout(() => {
        this.setupDragOver(element);
      }, 50);
    });
    
    element.addEventListener('dragleave', (e) => {
      // Check if the element we are over is the current element
      const rect = element.getBoundingClientRect();
      const x = e.clientX;
      const y = e.clientY;
      
      if (
        x <= rect.left ||
        x >= rect.right ||
        y <= rect.top ||
        y >= rect.bottom
      ) {
        this.removeDragOver(element);
      }
    });
    
    element.addEventListener('drop', (e) => {
      this.removeDragOver(element);
      e.preventDefault();
      
      const sourceId = e.dataTransfer?.getData('text/plain');
      const targetId = element.dataset.id;
      
      if (sourceId && targetId && sourceId !== targetId) {
        this.movePackInLoadOrder(main, sourceId, targetId);
      }
    });
  }
  
  /**
   * Setup the dragging state for an element.
   * @param {HTMLElement} element - The element to setup dragging for
   */
  private setupDragging(element: HTMLElement) {
    element.classList.add("dragging");
  }

  /**
   * Remove the dragging state for an element.
   * @param {HTMLElement} element - The element to remove dragging for
   */
  private removeDragging(element: HTMLElement) {
    element.classList.remove("dragging");
  }

  /**
   * Setup the drag-over state for an element.
   * @param {HTMLElement} element - The element to setup drag-over for
   */
  private setupDragOver(element: HTMLElement) {
    if (!element.classList.contains('drag-over')) {
      element.classList.add("drag-over");
    }
  }

  /**
   * Remove the drag-over state for an element.
   * @param {HTMLElement} element - The element to remove drag-over for
   */
  private removeDragOver(element: HTMLElement) {
    element.classList.remove("drag-over");
  }

  /************************
   * Selection & Sync
   ************************/

  /**
   * Sync the selection with the mod tree.
   * @param {Main} main - The main instance of the application.
   * @param {string} packName - The name of the selected pack.
   */
  private syncWithTreeSelection(main: Main, packName: string) {
    main.modTree.highlightTreeItemByPack(main, packName);
  }

  /**
   * Select an item by ID.
   * @param {string} itemId - The ID of the item to select.
   */
  public selectListItem(itemId: string) {
    document.querySelectorAll(".list-item").forEach(item => 
      item.classList.remove("selected")
    );
    
    const element = this.listElements.get(itemId);
    if (element) {
      element.classList.add("selected");  
      element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }
  
  /************************
   * Sorting
   ************************/

  /**
   * Move a mod up or down in the load order.
   * @param {Main} main - The main instance of the application.
   * @param {string} modId - The ID of the mod to move.
   * @param {LoadOrderDirectionMove} direction - The direction to move the mod.
   */
  private async movePackInLoadOrderInDirection(main: Main, modId: string, direction: LoadOrderDirectionMove) {
    try {
      const result = await invoke('move_pack_in_load_order_in_direction', { 
        modId, 
        direction,
      }) as ListItem[];

      // Due to being able to sort by other fields, we need to re-render the whole list.
      this.renderPackList(main, result);
      this.selectListItem(modId);

      main.statusMessage.textContent = 'Mod ' + modId + 	' moved ' + direction;
    } catch (error) {
      console.error('Error moving mod ' + direction + ':', error);
    }
  }
  
  /**
   * Change the position of a mod in the load order by drag and drop.
   * @param {Main} main - The main instance of the application.
   * @param {string} sourceId - The ID of the source element.
   * @param {string} targetId - The ID of the target element.
   */
  private async movePackInLoadOrder(main: Main, sourceId: string, targetId: string) {
    console.log('movePackInLoadOrder', sourceId, targetId);
    try {
      const result = await invoke('move_pack_in_load_order', { 
        sourceId, 
        targetId
      }) as ListItem[];
      
      // Due to being able to sort by other fields, we need to re-render the whole list.
      this.renderPackList(main, result);
      this.selectListItem(sourceId);
      
      main.statusMessage.textContent = 'Mods reordered';
    } catch (error) {
      console.error('Error reordering mods:', error);
    }
  }

  /**
   * Sort elements of the list by a specific field.
   * @param {Main} main - The main instance of the application.
   * @param {string} field - The field by which to sort.
   */
  private sortListItems(main: Main, field: string) {
    if (this.currentSortField === field) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.currentSortField = field;
      this.sortDirection = 'asc';
    }
    
    const listContainer = document.getElementById("list-items-container");
    if (listContainer && listContainer.children.length > 0) {
      const items: ListItem[] = [];
      
      this.listElements.forEach((element, id) => {
        const item: ListItem = {
          id,
          pack: element.dataset.pack || '',
          type: element.dataset.type || '',
          order: parseInt(element.dataset.order || '0'),
          location: element.dataset.location || '',
          steam_id: ''
        };
        items.push(item);
      });
      
      this.renderPackList(main, items);
    }
  }
  
  /**
   * Update the sort indicators in the headers.
   */
  private updateSortIndicators() {
    const headers = this.listHeader.querySelectorAll('.sortable');
    headers.forEach(header => {
      const field = header.getAttribute('data-sort') || '';
      const icon = header.querySelector('i');
      
      if (field === this.currentSortField) {
        icon?.classList.remove('fa-sort', 'fa-sort-up', 'fa-sort-down');
        icon?.classList.add(this.sortDirection === 'asc' ? 'fa-sort-up' : 'fa-sort-down');
      } else {
        icon?.classList.remove('fa-sort-up', 'fa-sort-down');
        icon?.classList.add('fa-sort');
      }
    });
  }
  
  /**
   * Sort an array of elements by a specific field.
   * @param {ListItem[]} items - The elements to sort.
   * @param {string} field - The field by which to sort.
   * @param {'asc' | 'desc'} direction - The direction of the sort.
   */
  private sortItems(items: ListItem[], field: string, direction: 'asc' | 'desc') {
    items.sort((a, b) => {
      let valueA: string | number = '';
      let valueB: string | number = '';
      
      switch (field) {
        case 'pack':
          valueA = a.pack.toLowerCase();
          valueB = b.pack.toLowerCase();
          break;
        case 'type':
          valueA = a.type.toLowerCase();
          valueB = b.type.toLowerCase();
          break;
        case 'order':
          valueA = a.order;
          valueB = b.order;
          break;
        case 'location':
          valueA = a.location.toLowerCase();
          valueB = b.location.toLowerCase();
          break;
        default:
          valueA = a.order;
          valueB = b.order;
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
   * Filtering
   ************************/

  /**
   * Filters the pack list using the value provided.
   * @param {SettingsManager} settingsManager - The settings manager instance.
   * @param {string} searchText - The value to filter the pack list.
   */ 
  public filterListItems(settingsManager: SettingsManager, searchText: string) {
    const normalizedSearchText = searchText.toLowerCase().trim();
    settingsManager.appSettings.list_filter_value = normalizedSearchText;
    settingsManager.saveSettings();
    
    if (normalizedSearchText === '') {
      this.listElements.forEach(element => element.classList.remove('hidden'));
      return;
    }
    
    this.listElements.forEach(element => {
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
}
