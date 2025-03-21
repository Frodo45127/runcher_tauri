
// Función actualizada para renderizar el árbol
export function renderTree(categories: TreeCategory[]) {
  const treeContainer = document.getElementById('tree-container');
  if (!treeContainer) return;

  // Clear maps for filtering
  categoryElements.clear();
  itemElements.clear();
  
  treeContainer.innerHTML = '';
  
  categories.forEach(category => {
    const categoryElement = document.createElement('div');
    categoryElement.className = 'tree-category';
    categoryElement.dataset.id = CSS.escape(category.id);

    // Add drag and drop event listeners
    setupDragAndDrop(categoryElement);

    const categoryHeader = document.createElement('div');
    categoryHeader.className = 'category-header';
    categoryHeader.innerHTML = `
      <span class="expander"><i class="fa-solid fa-chevron-right"></i></span>
      <span class="category-name">${category.id}</span>
    `;
    categoryHeader.addEventListener('click', () => {
      console.log(categoryElement.getAttribute('data-id'));
      toggleCategoryExpansion(categoryElement.getAttribute('data-id') || '')
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
        checkbox.addEventListener('change', (e) => {
          handleCheckboxChange(itemElement.getAttribute('data-id') || '', checkbox.checked);
        });
      }
      
      // Add drag and drop event listeners
      setupDragAndDrop(itemElement);

      // Evento para seleccionar item
      itemContent.addEventListener('click', (e) => {
        if (e.target !== checkbox) {
          selectTreeItem(itemElement.getAttribute('data-id') || '');
        }
      });

      itemElements.set(itemElement.getAttribute('data-id') || '', itemElement);
    });
    
    categoryElement.appendChild(categoryHeader);
    categoryElement.appendChild(itemsContainer);
    treeContainer.appendChild(categoryElement);

    categoryElements.set(categoryElement.getAttribute('data-id') || '', categoryElement);

    if (appSettings.tree_open_state[category.id] === true) {
      toggleCategoryExpansion(category.id, true);
    }
  });
}

// Filter tree items based on search text
export function filterTreeItems(searchText: string) {
  const normalizedSearchText = searchText.toLowerCase().trim();
  appSettings.tree_filter_value = normalizedSearchText;
  
  // If search text is empty, show all items
  if (normalizedSearchText === '') {
    categoryElements.forEach(element => element.classList.remove('hidden'));
    itemElements.forEach(element => element.classList.remove('hidden'));
    document.querySelectorAll('.category-items').forEach(
      element => element.classList.remove('hidden')
    );
    return;
  }
  
  // First, hide all items
  categoryElements.forEach(element => element.classList.add('hidden'));
  itemElements.forEach(element => element.classList.add('hidden'));
  document.querySelectorAll('.category-items').forEach(
    element => element.classList.add('hidden')
  );
  
  // Keep track of categories that need to be shown
  const categoriesToShow = new Set<string>();
  console.log(itemElements);
  // Check each game element
  itemElements.forEach((element, id) => {
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
      itemElements.forEach((itemElement) => {
        if (itemElement.dataset.categoryId === categoryId) {
          itemElement.classList.remove('hidden');
        }
      });
    }
  });
}