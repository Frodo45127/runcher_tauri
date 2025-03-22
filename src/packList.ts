/**
 * This file contains the functions for the pack list.
 */

interface ListItem {
  id: string;
  pack: string;
  type: string;
  order: number;
  location: string;
  steam_id: string;
}

export class PackList {
  private listElements: Map<string, HTMLElement> = new Map();
  private selectedListItemId: string | null = null;
  private listFilterInput = document.getElementById('list-filter') as HTMLInputElement;

  constructor(main: Main) {
    this.listElements = new Map();

    this.listFilterInput.addEventListener('input', () => {
      this.filterListItems(main.settingsManager, this.listFilterInput.value);
    });
  } 

  /**
   *  Render list items.
   * @param {ListItem[]} listData - The list data to render.
   */ 
  public renderListItems(listData: ListItem[]) {
    const listContainer = document.getElementById("list-items-container");
    
    if (listContainer) {
      listContainer.innerHTML = "";
      this.listElements.clear();
      
      listData.forEach(item => {
        const listItem = document.createElement("div");
        listItem.className = "list-item";
        listItem.dataset.id = item.id;
        listItem.dataset.pack = item.pack.toLowerCase();
        listItem.dataset.type = item.type.toLowerCase();
        listItem.dataset.location = item.location.toLowerCase();
        
        listItem.innerHTML = `
          <div>${item.pack}</div>
          <div>${item.type}</div>
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
          this.selectedListItemId = item.id;
        });
        
        listContainer.appendChild(listItem);
        this.listElements.set(item.id, listItem);
      });
    }
  }

  /**
   * Filters the pack list using the value provided.
   * @param {SettingsManager} settingsManager - The settings manager instance.
   * @param {string} searchText - The value to filter the pack list.
   */ 
  public filterListItems(settingsManager: SettingsManager, searchText: string) {
    const normalizedSearchText = searchText.toLowerCase().trim();
    settingsManager.appSettings.list_filter_value = normalizedSearchText;
    
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
