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
  description?: string;
}

export interface TreeCategory {
  id: string;
  name: string;
  children: TreeItem[];
}

export class ModTree {
  public categories: TreeCategory[];
  private categoryElements: Map<string, HTMLElement>;
  private itemElements: Map<string, HTMLElement>;
  private selectedCategories: Set<string>;
  private selectedItems: Set<string>;
  private treeFilterInput: HTMLInputElement;
  private currentSortField: string = 'name';
  private sortDirection: 'asc' | 'desc' = 'asc';
  private dragCounter: number;
  private dragOverElement: HTMLElement | null;
  private draggingCategory: boolean;
  public treeContainer: HTMLElement;
  private treeHeader: HTMLElement;

  private addCategoryBtn: HTMLButtonElement;
  private renameCategoryBtn: HTMLButtonElement;
  private removeCategoryBtn: HTMLButtonElement;
  private addModBtn: HTMLButtonElement;
  private removeModBtn: HTMLButtonElement;
  private downloadModBtn: HTMLButtonElement;
  private uploadModBtn: HTMLButtonElement;
  private lockModBtn: HTMLButtonElement;
  private unlockModBtn: HTMLButtonElement;
  private copyToSecondaryBtn: HTMLButtonElement;
  private copyToDataBtn: HTMLButtonElement;

  private addCategoryModal: HTMLElement;
  private addCategoryCancelBtn: HTMLButtonElement;
  private addCategoryAcceptAddBtn: HTMLButtonElement;
  private addCategoryAcceptRenameBtn: HTMLButtonElement;
  private addCategoryInput: HTMLInputElement;
  private addCategoryPrevNameInput: HTMLInputElement;
  private addCategoryErrorElement: HTMLElement;
  private addCategoryModalTitle: HTMLElement;

  private defaultCategory = 'Unassigned';

  constructor(main: Main) {
    this.categoryElements = new Map();
    this.itemElements = new Map();
    this.treeFilterInput = document.getElementById('tree-filter') as HTMLInputElement;
    this.selectedItems = new Set<string>();
    this.selectedCategories = new Set<string>();
    this.categories = [];
    this.dragCounter = 0;
    this.dragOverElement = null;
    this.draggingCategory = false;
    this.treeContainer = document.getElementById('tree-container') as HTMLElement;

    this.addCategoryBtn = document.getElementById('add-category-btn') as HTMLButtonElement;
    this.renameCategoryBtn = document.getElementById('rename-category-btn') as HTMLButtonElement;
    this.removeCategoryBtn = document.getElementById('remove-category-btn') as HTMLButtonElement;
    this.addModBtn = document.getElementById('add-mod-btn') as HTMLButtonElement;
    this.removeModBtn = document.getElementById('remove-mod-btn') as HTMLButtonElement;
    this.downloadModBtn = document.getElementById('download-mod-btn') as HTMLButtonElement;
    this.uploadModBtn = document.getElementById('upload-mod-btn') as HTMLButtonElement;
    this.lockModBtn = document.getElementById('lock-mod-btn') as HTMLButtonElement;
    this.unlockModBtn = document.getElementById('unlock-mod-btn') as HTMLButtonElement;
    this.copyToSecondaryBtn = document.getElementById('copy-to-secondary-btn') as HTMLButtonElement;
    this.copyToDataBtn = document.getElementById('copy-to-data-btn') as HTMLButtonElement;

    this.addCategoryModal = document.getElementById('add-category-modal') as HTMLElement;
    this.addCategoryCancelBtn = document.getElementById('add-category-modal-cancel-btn') as HTMLButtonElement;
    this.addCategoryAcceptAddBtn = document.getElementById('add-category-modal-accept-add-btn') as HTMLButtonElement;
    this.addCategoryAcceptRenameBtn = document.getElementById('add-category-modal-accept-rename-btn') as HTMLButtonElement;
    this.addCategoryInput = document.getElementById('add-category-modal-name-input') as HTMLInputElement;
    this.addCategoryPrevNameInput = document.getElementById('add-category-modal-prev-name-input') as HTMLInputElement;
    this.addCategoryErrorElement = document.getElementById('add-category-modal-error') as HTMLElement;
    this.addCategoryModalTitle = document.getElementById('add-category-modal-title') as HTMLElement;

    // Reorderable headers. Done here so we can recycle them when re-rendering the tree.
    this.treeHeader = document.createElement('div');
    this.treeHeader.className = 'tree-header';
    this.treeHeader.innerHTML = `
      <div class="header-column sortable" data-sort="name">Name <i class="fa-solid fa-sort"></i></div>
      <div class="header-column sortable" data-sort="type">Type <i class="fa-solid fa-sort"></i></div>
      <div class="header-column sortable" data-sort="creator">Creator <i class="fa-solid fa-sort"></i></div>
      <div class="header-column sortable" data-sort="size">Size <i class="fa-solid fa-sort"></i></div>
    `;

    // Add click events to the sortable columns
    const sortableColumns = this.treeHeader.querySelectorAll('.sortable');
    sortableColumns.forEach(column => {
      column.addEventListener('click', () => {
        const field = column.getAttribute('data-sort') || 'name';
        this.sortTreeItems(main, field);
      });
    });

    this.treeContainer.appendChild(this.treeHeader);
    this.treeFilterInput.addEventListener('input', () => {
      this.filterTreeItems(main.settingsManager, this.treeFilterInput.value);
    });

    // Add listeners for all the action buttons in the actions panel.
    this.addCategoryBtn.addEventListener('click', () => this.addCategory());
    this.renameCategoryBtn.addEventListener('click', () => this.renameCategory());
    this.removeCategoryBtn.addEventListener('click', () => this.removeCategory());
    this.addModBtn.addEventListener('click', () => this.addMod());
    this.removeModBtn.addEventListener('click', () => this.removeMod());
    this.downloadModBtn.addEventListener('click', () => this.downloadMod());
    this.uploadModBtn.addEventListener('click', () => this.uploadMod());
    this.lockModBtn.addEventListener('click', () => this.lockMod());
    this.unlockModBtn.addEventListener('click', () => this.unlockMod());
    this.copyToSecondaryBtn.addEventListener('click', () => this.copyToSecondary());
    this.copyToDataBtn.addEventListener('click', () => this.copyToData());

    // Add listeners for the add category modal.
    this.addCategoryCancelBtn.addEventListener('click', () => this.closeAddCategoryNameModal());
    this.addCategoryModal.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (!this.addCategoryAcceptAddBtn.classList.contains('hidden')) {
          this.addCategoryAcceptAddBtn.click();
        } else if (!this.addCategoryAcceptRenameBtn.classList.contains('hidden')) {
          this.addCategoryAcceptRenameBtn.click();
        }
      }
    });
    this.addCategoryAcceptAddBtn.addEventListener('click', () => this.addCategorySuccess(main));
    this.addCategoryAcceptRenameBtn.addEventListener('click', () => this.renameCategorySuccess(main));
  }

  /**
   * Clear and render the mod tree.
   * @param {Main} main - The main instance of the application.
   */
  public async renderTree(main: Main) {

    // Clear maps for filtering
    this.categoryElements.clear();
    this.itemElements.clear();

    this.treeContainer.removeChild(this.treeHeader);
    this.treeContainer.innerHTML = '';
    this.treeContainer.appendChild(this.treeHeader);

    // Then render the categories and their items
    this.categories.forEach(category => {
      const categoryElement = document.createElement('div');
      categoryElement.className = 'tree-category';
      categoryElement.dataset.id = CSS.escape(category.id);
      categoryElement.dataset.name = category.name;
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
        <span class="category-name">${category.name}</span>
      `;

      // Find the category name element within the category header
      const categoryNameElement = categoryHeader.querySelector('.category-name') as HTMLElement;
      categoryNameElement.addEventListener('click', (e: Event) => {
        e.stopPropagation();
        const mouseEvent = e as MouseEvent;
        this.selectCategory(main, categoryElement.getAttribute('data-id') || '', mouseEvent.ctrlKey, mouseEvent.shiftKey);
      });

      categoryHeader.addEventListener('click', () => {
        this.toggleCategoryExpansion(main.settingsManager, categoryElement.getAttribute('data-id') || '');
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
            <input type="checkbox" class="tree-checkbox" ${item.is_checked ? 'checked' : ''} id="check-${itemElement.getAttribute('data-id')}">
          </div>
          <div class="item-details">
            <div class="item-row">
              <div class="item-name"><i>${item.name}</i></div>
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

        itemContent.addEventListener('dblclick', () => {
          main.modDetails.toggleModDetails(itemElement.getAttribute('data-id') || '');
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

      this.treeContainer.appendChild(categoryElement);

      this.categoryElements.set(categoryElement.getAttribute('data-id') || '', categoryElement);

      if (main.settingsManager.appSettings.tree_open_state[category.id] === true) {
        this.toggleCategoryExpansion(main.settingsManager, categoryElement.getAttribute('data-id') || '', true);
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
   * Select a category.
   * @param {Main} main - The main instance of the application.
   * @param {string} categoryId - The id of the category to select.
   * @param {boolean} isCtrlPressed - Whether Ctrl key is pressed (for multi-select).
   * @param {boolean} isShiftPressed - Whether Shift key is pressed (for range selection).
   */
  public selectCategory(main: Main, categoryId: string, isCtrlPressed: boolean = false, isShiftPressed: boolean = false) {
    if (!isCtrlPressed && !isShiftPressed) {

      // Clear any previously selected categories and items
      const currentlySelectedCategories = document.querySelectorAll('.tree-category.selected');
      currentlySelectedCategories.forEach(item => {
        item.classList.remove('selected');
      });

      const currentlySelectedItems = document.querySelectorAll('.tree-item.selected');
      currentlySelectedItems.forEach(item => {
        item.classList.remove('selected');
      });

      this.selectedCategories.clear();
      this.selectedItems.clear();
    }

    const categoryElement = this.categoryElements.get(categoryId);
    if (!categoryElement) return;

    if (isShiftPressed && this.selectedCategories.size > 0) {
      const categories = Array.from(document.querySelectorAll('.tree-category'));
      const lastSelectedId = Array.from(this.selectedCategories)[this.selectedCategories.size - 1];
      const lastSelectedIndex = categories.findIndex(item => item.getAttribute('data-id') === lastSelectedId);
      const currentIndex = categories.findIndex(item => item.getAttribute('data-id') === categoryId);

      const start = Math.min(lastSelectedIndex, currentIndex);
      const end = Math.max(lastSelectedIndex, currentIndex);

      for (let i = start; i <= end; i++) {
        const id = categories[i].getAttribute('data-id');
        if (id) {
          this.selectedCategories.add(id);
          categories[i].classList.add('selected');
        }
      }
    } else if (isCtrlPressed) {
      if (this.selectedCategories.has(categoryId)) {
        this.selectedCategories.delete(categoryId);
        categoryElement.classList.remove('selected');
      } else {
        this.selectedCategories.add(categoryId);
        categoryElement.classList.add('selected');
      }
    } else {
      this.selectedCategories.add(categoryId);
      categoryElement.classList.add('selected');
    }

    if (this.selectedCategories.size === 1) {
      main.settingsManager.appSettings.selected_tree_category = categoryId;
      main.settingsManager.saveSettings();
    }
  }

  /**
   * Select a tree item.
   * @param {Main} main - The main instance of the application.
   * @param {string} itemId - The id of the item to select.
   * @param {boolean} isCtrlPressed - Whether Ctrl key is pressed (for multi-select).
   * @param {boolean} isShiftPressed - Whether Shift key is pressed (for range selection).
   */
  public selectTreeItem(main: Main, itemId: string, isCtrlPressed: boolean = false, isShiftPressed: boolean = false) {
    if (!isCtrlPressed && !isShiftPressed) {
      const currentlySelectedItems = document.querySelectorAll('.tree-item.selected');
      currentlySelectedItems.forEach(item => {
        item.classList.remove('selected');
      });
      this.selectedItems.clear();

      const currentlySelectedCategories = document.querySelectorAll('.tree-category.selected');
      currentlySelectedCategories.forEach(category => {
        category.classList.remove('selected');
      });
      this.selectedCategories.clear();
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

      this.syncListWithTreeSelection(main, itemId);
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
   * @param {Main} main - The main instance of the application.
   * @param {string} packName - The name of the pack to highlight.
   */
  public highlightTreeItemByPack(main: Main, packName: string) {
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
        main,
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
   * @param {string} field - The field to sort by.
   */
  private sortTreeItems(main: Main, field: string) {
    if (this.currentSortField === field) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.currentSortField = field;
      this.sortDirection = 'asc';
    }

    // Re-render the tree with the sorted items
    this.renderTree(main);
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
        icon?.classList.remove('fa-sort', 'fa-sort-up', 'fa-sort-down');
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
      main.showStatusMessage(`Reordering categories...`);
      await invoke("reorder_categories", { sourceId, targetId });

      // Reorder the categories in the cached categories array.
      const sourceIndex = this.categories.findIndex(c => c.id === sourceId);
      let targetIndex = this.categories.findIndex(c => c.id === targetId);
      if (targetIndex > sourceIndex) {
        targetIndex--;
      }
      const [movedCategory] = this.categories.splice(sourceIndex, 1);
      this.categories.splice(targetIndex, 0, movedCategory);

      const sourceCat = this.categoryElements.get(sourceId);
      const targetCat = this.categoryElements.get(targetId);

      if (sourceCat && targetCat) {
        const container = sourceCat.parentNode;
        if (container) {
          container.insertBefore(sourceCat, targetCat);
        }
      }

      main.showStatusMessage(`Categories reordered successfully`);
    } catch (error) {
      console.error("Failed to reorder categories:", error);
      main.showStatusMessage(`Error reordering categories: ${error}`);
    }
  }

  /**
   * Handle toggling a mod through its checkbox.
   * @param {Main} main - The main instance of the application.
   * @param {string} itemId - The id of the item to change.
   * @param {boolean} isChecked - The new state of the checkbox.
   */
  public async handleModToggled(main: Main, itemId: string, isChecked: boolean) {
    main.loadingManager.showListLoading(main);
    try {
      const listData = await invoke('handle_mod_toggled', {
        modId: itemId.replace(/\\/g, ''),
        isChecked: isChecked
      }) as ListItem[];

      main.packList.renderPackList(main, listData);
    } catch (error) {
      console.error('Failed to handle mod toggled:', error);
    } finally {
      main.loadingManager.hideListLoading(main);
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
      main.showStatusMessage(`Moving ${sourceIds.length} mods...`);

      const movedIds = sourceIds.filter(sourceId => sourceId !== targetId);
      await invoke("handle_mod_category_change", { modIds: movedIds, categoryId: targetId });

      // By default, we don't move anything in the UI. Instead we move it in the backend, and if it works,
      // we manually search the entries in the tree and move them.
      const target = this.categoryElements.get(targetId);
      if (!target) return;

      const targetContainer = target.querySelector('.category-items');
      if (!targetContainer) return;

      // Mods are added at the end of the target category. We also need to update the cached categories,
      // so we can re-render the tree with the correct order after sorting it.
      const targetCategory = this.categories.find(c => c.id === targetId) as TreeCategory;
      for (const sourceId of sourceIds) {
        const itemElement = this.itemElements.get(sourceId);
        if (itemElement && itemElement.dataset.categoryId !== targetId) {

          const sourceCategory = this.categories.find(c => CSS.escape(c.id) === itemElement.dataset.categoryId) as TreeCategory;
          const modIndex = sourceCategory.children.findIndex(c => CSS.escape(c.id) === sourceId);
          const movedMod = sourceCategory.children.splice(modIndex, 1)[0];
          targetCategory.children.push(movedMod);

          itemElement.dataset.categoryId = targetId;
        }
      }

      // Sort the mod items (not the categories) by the current sort column.
      const sortedItems = [...targetCategory.children];
      this.sortItems(sortedItems, this.currentSortField, this.sortDirection);

      for (const item of sortedItems) {
        const escapedId = CSS.escape(item.id);
        const itemElement = this.itemElements.get(escapedId) as HTMLElement;
        itemElement.remove();
        targetContainer.appendChild(itemElement);
      }

      main.showStatusMessage(`${sourceIds.length} mods moved successfully`);
    } catch (error) {
      console.error("Failed to handle items drop:", error);
    }
  }

  /************************
   * Getters
   ************************/

  /**
   * Get an item element by its id.
   * @param {string} id - The id of the item.
   * @returns {HTMLElement} - The item element.
   */
  public getItemElementById(id: string): HTMLElement {
    return this.itemElements.get(id) as HTMLElement;
  }

  /**
   * Get a mod details element by its id.
   * @param {string} id - The id of the mod.
   * @returns {TreeItem | null} - The mod details element.
   */
  public getModDetailsElementById(id: string): TreeItem | null {
    let modDetails: TreeItem | null = null;
    const idUnescaped = id.replace(/\\/g, '');
    for (const category of this.categories) {
      const mod = category.children.find(item => item.id === idUnescaped);

      if (mod) {
        modDetails = mod;
        break;
      }
    }

    return modDetails
  }

  /**
   * Get the parent element of the tree.
   * @returns {HTMLElement} - The parent element of the tree.
   */
  public getTreeParentElement(): HTMLElement {
    return this.treeContainer.parentElement as HTMLElement;
  }

  /************************
   * Actions
   ************************/

  /**
   * Add a new empty category to the tree.
   */
  public async addCategory() {
    this.openAddCategoryNameModal('Add Category', '');
  }

  public async renameCategory() {
    const categorySelected = this.selectedCategories.values().next().value;
    if (categorySelected) {
      this.openAddCategoryNameModal('Rename Category', categorySelected);
    } else {
      main.showStatusMessage('No category selected.');
    }
  }

  public async removeCategory() {
    if (this.selectedCategories.size === 0) {
      main.showStatusMessage('No category selected.');
      return;
    }

    try {
      const defaultCategory = this.categories.find(c => c.id === this.defaultCategory) as TreeCategory;
      for (const categorySelected of this.selectedCategories) {
        await invoke('remove_category', { category: categorySelected }) as string[];

        // Update the cached categories, reparenting orphaned mods to the default category.
        const modsToReparent = this.categories.find(c => c.id === categorySelected)?.children || [];
        defaultCategory.children.push(...modsToReparent);
        this.categories.splice(this.categories.findIndex(c => c.id === categorySelected), 1);
        this.reparentMods(categorySelected, this.defaultCategory);

        // Remove the category from the settingsManager.appSettings.tree_open_state.
        delete main.settingsManager.appSettings.tree_open_state[categorySelected];
      }

      main.settingsManager.appSettings.tree_open_state[this.defaultCategory] = true;
      main.settingsManager.saveSettings();

      // Sort the mod items (not the categories) by the current sort column.
      const sortedItems = [...defaultCategory.children];
      this.sortItems(sortedItems, this.currentSortField, this.sortDirection);

      // Reparent the mods in the UI.
      const defaultCategoryElement = this.categoryElements.get(this.defaultCategory) as HTMLElement;
      const defaultCategoryItems = defaultCategoryElement.querySelector('.category-items') as HTMLElement;

      for (const item of sortedItems) {
        const escapedId = CSS.escape(item.id);
        const itemElement = this.itemElements.get(escapedId) as HTMLElement;
        itemElement.remove();
        defaultCategoryItems.appendChild(itemElement);

        this.selectedCategories.delete(escapedId);
      }

      // Second loop is to delete the categories themselfs, after all the mods have been properly reparented.
      for (const categorySelected of this.selectedCategories) {
        const categoryElement = this.categoryElements.get(categorySelected) as HTMLElement;
        categoryElement.remove();
        this.categoryElements.delete(categorySelected);
      }

      main.showStatusMessage('Categories removed successfully');
    } catch (error) {
      main.showStatusMessage(`Error removing categories: ${error}`);
    }
  }

  public async addMod() {
    console.log('addMod');
  }

  public async removeMod() {
    console.log('removeMod');
  }

  public async downloadMod() {
    console.log('downloadMod');
  }

  public async uploadMod() {
    console.log('uploadMod');
  }

  public async lockMod() {
    console.log('lockMod');
  }

  public async unlockMod() {
    console.log('unlockMod');
  }

  public async copyToSecondary() {
    console.log('copyToSecondary');
  }

  public async copyToData() {
    console.log('copyToData');
  }

  /************************
   * Utils
   ************************/

  /**
   * Open the add category name modal.
   * @param {string} title - The title of the modal.
   * @param {string} currentName - The current name of the category.
   */
  private openAddCategoryNameModal(title: string, currentName: string) {
    this.addCategoryModal.classList.add('active');
    this.addCategoryInput.value = currentName;
    this.addCategoryErrorElement.textContent = '';
    this.addCategoryModalTitle.textContent = title;

    // Rename always has a previous name.
    this.addCategoryPrevNameInput.value = currentName;
    if (currentName === '') {
      this.addCategoryAcceptAddBtn.classList.remove('hidden');
    } else {
      this.addCategoryAcceptRenameBtn.classList.remove('hidden');
    }

    this.addCategoryInput.focus();
  }

  private closeAddCategoryNameModal() {
    this.addCategoryModal.classList.remove('active');
    this.addCategoryAcceptAddBtn.classList.add('hidden');
    this.addCategoryAcceptRenameBtn.classList.add('hidden');
  }

  private async addCategorySuccess(main: Main) {
    const categoryName = this.addCategoryInput.value.trim();
    this.addCategoryErrorElement.textContent = '';

    try {
      const newOrder = await invoke('create_category', { category: categoryName }) as string[];

      const newCategory: TreeCategory = {
        id: categoryName,
        name: categoryName,
        children: []
      };

      this.categories.push(newCategory);
      this.categories = newOrder.map(id => {
        const category = this.categories.find(cat => cat.id === id);
        return category ? category : null;
      }).filter(Boolean) as TreeCategory[];

      this.renderTree(main);
      this.closeAddCategoryNameModal();
      main.showStatusMessage('Category created successfully');
    } catch (error) {
      this.addCategoryErrorElement.textContent = `Error creating category: ${error}`;
    }
  }

  private renameCategorySuccess(main: Main) {
    const newName = this.addCategoryInput.value.trim();
    const originalName = this.addCategoryPrevNameInput.value.trim();
    this.addCategoryErrorElement.textContent = '';

    try {
      invoke('rename_category', { category: originalName, newName }).then(() => {

        // We need to update the category name in the following places to avoid a full re-render:
        // - this.categories.
        // - this.categoryElements.
        // - The text in the category header.
        // - The categoryElement.dataset.name and id.
        // - The categoryItems id.
        // - The data-category-id attribute of all the items in the category.
        // - The settingsManager.appSettings.tree_open_state.
        const categoryToRename = this.categories.find(cat => cat.id === originalName);
        if (categoryToRename) {
          categoryToRename.id = newName;
          categoryToRename.name = newName;
        }

        // Update the categoryElement.dataset.name and id.
        const newEscapedId = CSS.escape(newName);
        const categoryElement = this.categoryElements.get(originalName);

        if (categoryElement) {
          categoryElement.dataset.name = newName;
          categoryElement.dataset.id = newEscapedId;

          const categoryNameElement = categoryElement.querySelector('.category-name') as HTMLElement;
          if (categoryNameElement) {
            categoryNameElement.textContent = newName;
          }

          const categoryItems = categoryElement.querySelector('.category-items');
          if (categoryItems) {
            categoryItems.id = `children-${categoryElement.dataset.id}`;
          }

          this.categoryElements.set(newName, categoryElement);
          this.categoryElements.delete(originalName);
        }

        // Update the data-category-id attribute of all the items in the category.
        this.reparentMods(originalName, newName);

        // Update the cached selected categories.
        const originalEscapedId = CSS.escape(originalName);
        this.selectedCategories.delete(originalEscapedId);
        this.selectedCategories.add(newEscapedId);

        // Update the settingsManager.appSettings.tree_open_state.
        delete main.settingsManager.appSettings.tree_open_state[originalName];
        main.settingsManager.appSettings.tree_open_state[newName] = true;
        main.settingsManager.saveSettings();

        this.closeAddCategoryNameModal();
        main.showStatusMessage('Category renamed successfully');
      });
    } catch (error) {
      this.addCategoryErrorElement.textContent = `Error renaming category: ${error}`;
    }
  }

  /**
   * Reparent the mods to a new category.
   * Note that this only updates the category id in each mod element.
   * It does not move the mod elements to the new category.
   * @param {string} originalName - The original name of the category.
   * @param {string} newName - The new name of the category.
   */
  private reparentMods(originalName: string, newName: string) {
      const items = this.itemElements.values();
      for (const item of items) {
        if (item.dataset.categoryId === originalName) {
          item.dataset.categoryId = newName;
        }
      }
  }

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