/**
 * This file contains the functions for the pack list.
 */


/**
 *  Load list items from Rust.
 */ 
async function loadListItems() {
  try {
    listData = await invoke("get_list_items");
    renderListItems();
  } catch (error) {
    console.error("Failed to load list items:", error);
  }
}

/**
 *  Render list items.
 */ 
export function renderListItems() {
  const listContainer = document.getElementById("list-items-container");
  
  if (listContainer) {
    listContainer.innerHTML = "";
    listElements.clear();
    
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
        selectedListItemId = item.id;
      });
      
      listContainer.appendChild(listItem);
      listElements.set(item.id, listItem);
    });
  }
}

/**
 * Filters the pack list using the value provided.
 * @param {string} searchText - The value to filter the pack list.
 */ 
export function filterListItems(searchText: string) {
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