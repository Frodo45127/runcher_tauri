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

export class PackList {
  private listElements: Map<string, HTMLElement>;
  private listFilterInput: HTMLInputElement;
  private currentSortField: string = 'order';
  private sortDirection: 'asc' | 'desc' = 'asc';

  constructor(main: Main) {
    this.listElements = new Map();
    this.listFilterInput = document.getElementById('list-filter') as HTMLInputElement;

    this.listFilterInput.addEventListener('input', () => {
      this.filterListItems(main.settingsManager, this.listFilterInput.value);
    });
    
    // Agregar eventos de ordenación para el encabezado de la lista
    this.setupSortEvents(main);
  } 

  /**
   * Configure sort events for the list headers.
   * @param {Main} main - The main instance of the application.
   */
  private setupSortEvents(main: Main) {
    const listHeader = document.querySelector('.list-header');
    if (listHeader) {
      listHeader.innerHTML = `
        <div class="header-column sortable" data-sort="pack">Mod <i class="fa-solid fa-sort"></i></div>
        <div class="header-column sortable" data-sort="type">Tipo <i class="fa-solid fa-sort"></i></div>
        <div class="header-column sortable" data-sort="order">Orden <i class="fa-solid fa-sort"></i></div>
        <div class="header-column sortable" data-sort="location">Ubicación <i class="fa-solid fa-sort"></i></div>
      `;
      
      const sortableColumns = listHeader.querySelectorAll('.sortable');
      sortableColumns.forEach(column => {
        column.addEventListener('click', (e) => {
          const field = (e.currentTarget as HTMLElement).getAttribute('data-sort') || 'order';
          this.sortListItems(main, field);
        });
      });
    }
  }

  /**
   *  Render list items.
   * @param {Main} main - The main instance of the application.
   * @param {ListItem[]} listData - The list data to render.
   */ 
  public renderListItems(main: Main, listData: ListItem[]) {
    const listContainer = document.getElementById("list-items-container");
    
    if (listContainer) {
      listContainer.innerHTML = "";
      this.listElements.clear();
      
      // Sort the elements by the current sort field
      const sortedItems = [...listData];
      this.sortItems(sortedItems, this.currentSortField, this.sortDirection);
      
      sortedItems.forEach(item => {
        const listItem = document.createElement("div");
        listItem.className = "list-item";
        listItem.dataset.id = item.id;
        listItem.dataset.pack = item.pack.toLowerCase();
        listItem.dataset.type = item.type.toLowerCase();
        listItem.dataset.order = item.order.toString();
        listItem.dataset.location = item.location.toLowerCase();
        listItem.draggable = true;
        
        // Create the element content with movement buttons
        listItem.innerHTML = `
          <div>${item.pack}</div>
          <div>${item.type}</div>
          <div class="order-container">
            <span>${item.order}</span>
            <div class="move-buttons">
              <button class="move-up-btn" title="Mover arriba"><i class="fa-solid fa-chevron-up"></i></button>
              <button class="move-down-btn" title="Mover abajo"><i class="fa-solid fa-chevron-down"></i></button>
            </div>
          </div>
          <div>${item.location}</div>
        `;
        
        listItem.addEventListener("click", (e) => {

          // Ignore the click if it was in a movement button
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
        
        // Configure movement buttons events
        const moveUpBtn = listItem.querySelector('.move-up-btn');
        const moveDownBtn = listItem.querySelector('.move-down-btn');
        
        if (moveUpBtn) {
          moveUpBtn.addEventListener('click', () => {
            this.moveItemUp(main, item.id);
          });
        }
        
        if (moveDownBtn) {
          moveDownBtn.addEventListener('click', () => {
            this.moveItemDown(main, item.id);
          });
        }
        
        // Configure drag and drop events
        this.setupDragDrop(main, listItem);
        
        listContainer.appendChild(listItem);
        this.listElements.set(item.id, listItem);
      });

      // Update the sort indicators
      this.updateSortIndicators();
      
      this.filterListItems(main.settingsManager, main.settingsManager.appSettings.list_filter_value);
    }
  }

  /**
   * Configure drag and drop for list items.
   * @param {Main} main - The main instance of the application.
   * @param {HTMLElement} element - The element to which the events will be applied.
   */
  private setupDragDrop(main: Main, element: HTMLElement) {
    element.addEventListener('dragstart', (e) => {
      e.dataTransfer?.setData('text/plain', element.dataset.id || '');
      element.classList.add('dragging');
    });
    
    element.addEventListener('dragend', () => {
      element.classList.remove('dragging');
    });
    
    element.addEventListener('dragover', (e) => {
      e.preventDefault();
      element.classList.add('drag-over');
    });
    
    element.addEventListener('dragleave', () => {
      element.classList.remove('drag-over');
    });
    
    element.addEventListener('drop', (e) => {
      e.preventDefault();
      element.classList.remove('drag-over');
      
      const sourceId = e.dataTransfer?.getData('text/plain');
      const targetId = element.dataset.id;
      
      if (sourceId && targetId && sourceId !== targetId) {
        this.reorderItems(main, sourceId, targetId);
      }
    });
  }

  /**
   * Sync the selection with the mod tree.
   * @param {Main} main - The main instance of the application.
   * @param {string} packName - The name of the selected pack.
   */
  private syncWithTreeSelection(main: Main, packName: string) {
    main.modTree.highlightTreeItemByPack(packName);
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
  
  /**
   * Move an item up in the list.
   * @param {Main} main - The main instance of the application.
   * @param {string} itemId - The ID of the item to move.
   */
  private async moveItemUp(main: Main, itemId: string) {
    try {
      const result = await invoke('move_list_item', { 
        itemId, 
        direction: 'up'
      }) as ListItem[];
      
      this.renderListItems(main, result);
      
      main.statusMessage.textContent = 'Elemento movido hacia arriba';
    } catch (error) {
      console.error('Error al mover el elemento hacia arriba:', error);
    }
  }
  
  /**
   * Move an item down in the list.
   * @param {Main} main - The main instance of the application.
   * @param {string} itemId - The ID of the item to move.
   */
  private async moveItemDown(main: Main, itemId: string) {
    try {
      const result = await invoke('move_list_item', { 
        itemId, 
        direction: 'down'
      }) as ListItem[];
      
      this.renderListItems(main, result);

      main.statusMessage.textContent = 'Elemento movido hacia abajo';
    } catch (error) {
      console.error('Error al mover el elemento hacia abajo:', error);
    }
  }
  
  /**
   * Reorder elements by drag and drop.
   * @param {Main} main - The main instance of the application.
   * @param {string} sourceId - The ID of the source element.
   * @param {string} targetId - The ID of the target element.
   */
  private async reorderItems(main: Main, sourceId: string, targetId: string) {
    try {
      const result = await invoke('reorder_list_items', { 
        sourceId, 
        targetId
      }) as ListItem[];
      
      this.renderListItems(main, result);
      
      main.statusMessage.textContent = 'Elementos reordenados';
    } catch (error) {
      console.error('Error al reordenar los elementos:', error);
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
    
    // If there are elements in the list, sort them and render them again
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
      
      this.renderListItems(main, items);
    }
  }
  
  /**
   * Update the sort indicators in the headers.
   */
  private updateSortIndicators() {
    const headers = document.querySelectorAll('.list-header .sortable');
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
