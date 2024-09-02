let db;
let photos = [];
let currentPhoto = null;

// Open or create IndexedDB
function openDatabase() {
    const request = indexedDB.open('photoLibraryDB', 1);

    request.onerror = (event) => {
        console.error('Database error:', event.target.error);
    };

    request.onsuccess = (event) => {
        db = event.target.result;
        loadPhotosFromIndexedDB();
    };

    request.onupgradeneeded = (event) => {
        db = event.target.result;
        const objectStore = db.createObjectStore('photos', { keyPath: 'id', autoIncrement: true });
        objectStore.createIndex('title', 'title', { unique: false });
        objectStore.createIndex('tags', 'tags', { unique: false });
        objectStore.createIndex('author', 'author', { unique: false });
    };
}

// Load photos from IndexedDB
function loadPhotosFromIndexedDB() {
    const transaction = db.transaction(['photos'], 'readonly');
    const objectStore = transaction.objectStore('photos');
    const request = objectStore.getAll();

    request.onsuccess = (event) => {
        photos = event.target.result;
        photos.forEach(photo => addPhotoToGallery(photo));
    };
}

// Save photo to IndexedDB
function savePhotoToIndexedDB(photo) {
    const transaction = db.transaction(['photos'], 'readwrite');
    const objectStore = transaction.objectStore('photos');
    objectStore.add(photo);

    transaction.oncomplete = () => {
        console.log('Photo saved to IndexedDB');
    };

    transaction.onerror = (event) => {
        console.error('Error saving photo to IndexedDB:', event.target.error);
    };
}

// Handle photo uploads
document.getElementById('addPhotosButton').addEventListener('click', () => {
    const files = document.getElementById('imageInput').files;
    if (files.length === 0) {
        alert("Please select at least one image to upload.");
        return;
    }

    Array.from(files).forEach(file => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const imageUrl = e.target.result;
            const photo = {
                id: Date.now(),
                src: imageUrl,
                title: '',
                tags: [],
                author: '',
                metadata: {}
            };

            // Extract metadata and generate tags
            EXIF.getData(file, function() {
                const allMetaData = EXIF.getAllTags(this);
                photo.metadata = allMetaData;

                // Auto-generate tags based on metadata
                if (allMetaData.DateTimeOriginal) {
                    const date = formatDateTime(allMetaData.DateTimeOriginal);
                    photo.tags.push(date);
                }
                if (allMetaData.Make && allMetaData.Model) {
                    const device = `${allMetaData.Make} ${allMetaData.Model}`;
                    photo.tags.push(device);
                }

                addPhotoToGallery(photo);
                savePhotoToIndexedDB(photo);
            });
        };
        reader.readAsDataURL(file);
    });

    // Reset the file input after processing the files
    document.getElementById('imageInput').value = '';
});

// Function to format the DateTimeOriginal metadata
function formatDateTime(dateTime) {
    const date = new Date(dateTime.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3'));
    return date.toLocaleDateString() + " " + date.toLocaleTimeString();
}

// Function to add a photo to the gallery
function addPhotoToGallery(photo) {
    const gallery = document.getElementById('gallery');
    const photoTile = document.createElement('div');
    photoTile.className = 'photo-tile';

    const img = document.createElement('img');
    img.src = photo.src;
    img.alt = photo.title || "Uploaded Photo";
    img.addEventListener('click', () => showPhotoDetails(photo)); // Make thumbnail clickable

    const titleDiv = document.createElement('div');
    titleDiv.className = 'photo-title';
    titleDiv.textContent = photo.title || "No Title";

    const quickActionsDiv = document.createElement('div');
    quickActionsDiv.className = 'quick-actions';

    const editButton = document.createElement('button');
    editButton.textContent = 'Edit';
    editButton.onclick = () => {
        showPhotoDetails(photo);
    };

    const deleteButton = document.createElement('button');
    deleteButton.textContent = 'Delete';
    deleteButton.onclick = () => {
        deletePhoto(photo, photoTile);
    };

    quickActionsDiv.appendChild(editButton);
    quickActionsDiv.appendChild(deleteButton);

    photoTile.appendChild(img);
    photoTile.appendChild(titleDiv);
    photoTile.appendChild(quickActionsDiv);
    gallery.appendChild(photoTile);
}

// Show the photo details
function showPhotoDetails(photo) {
    currentPhoto = photo;
    document.getElementById('detailImage').src = photo.src;
    document.getElementById('titleInput').value = photo.title;
    document.getElementById('manualTagsOutput').innerHTML = '';
    document.getElementById('authorOutput').innerHTML = '';

    // Display existing tags (including auto-generated tags)
    photo.tags.forEach(tag => {
        document.getElementById('manualTagsOutput').appendChild(createLabel(tag));
    });

    // Display existing author
    if (photo.author) {
        document.getElementById('authorOutput').appendChild(createLabel(photo.author));
    }

    const detailSection = document.getElementById('detailSection');
    detailSection.style.display = 'block';
    detailSection.scrollIntoView({ behavior: 'smooth', block: 'center' });

    document.getElementById('saveTitleButton').disabled = false;
    document.getElementById('saveTitleButton').onclick = saveTitle;

    document.getElementById('editTitleButton').onclick = () => {
        document.getElementById('titleInput').disabled = false;
        document.getElementById('saveTitleButton').disabled = false;
    };

    document.getElementById('addTagButton').onclick = addCustomTag;

    // Handle author buttons
    document.querySelectorAll('.author-button').forEach(button => {
        button.addEventListener('click', () => {
            const authorText = button.getAttribute('data-author');
            currentPhoto.author = authorText;
            document.getElementById('authorOutput').innerHTML = ''; // Clear previous output
            document.getElementById('authorOutput').appendChild(createLabel(authorText));
            updatePhotoInIndexedDB(currentPhoto);
        });
    });

    // Handle manual author input
    document.getElementById('addAuthorButton').onclick = () => {
        const authorText = document.getElementById('manualAuthorInput').value.trim();
        if (authorText) {
            currentPhoto.author = authorText;
            document.getElementById('authorOutput').innerHTML = ''; // Clear previous output
            document.getElementById('authorOutput').appendChild(createLabel(authorText));
            updatePhotoInIndexedDB(currentPhoto);
            document.getElementById('manualAuthorInput').value = ''; // Clear input field
        }
    };

    // Handle pre-selected tag buttons
    document.querySelectorAll('.pre-tag-button').forEach(button => {
        button.addEventListener('click', () => {
            const tagText = button.getAttribute('data-tag');
            if (currentPhoto && !currentPhoto.tags.includes(tagText)) {
                currentPhoto.tags.push(tagText);
                document.getElementById('manualTagsOutput').appendChild(createLabel(tagText));
                updatePhotoInIndexedDB(currentPhoto);
            }
        });
    });
}

// Function to save the title of the photo
function saveTitle() {
    if (currentPhoto) {
        currentPhoto.title = document.getElementById('titleInput').value;
        updateGalleryTitles();
        updatePhotoInIndexedDB(currentPhoto);
        document.getElementById('titleInput').disabled = true;
        document.getElementById('saveTitleButton').disabled = true;
    }
}

// Update a photo in IndexedDB
function updatePhotoInIndexedDB(photo) {
    const transaction = db.transaction(['photos'], 'readwrite');
    const objectStore = transaction.objectStore('photos');
    objectStore.put(photo);

    transaction.oncomplete = () => {
        console.log('Photo updated in IndexedDB');
    };

    transaction.onerror = (event) => {
        console.error('Error updating photo in IndexedDB:', event.target.error);
    };
}

// Function to update gallery titles
function updateGalleryTitles() {
    const galleryItems = document.querySelectorAll('.photo-tile');
    galleryItems.forEach((item, index) => {
        const titleDiv = item.querySelector('.photo-title');
        titleDiv.textContent = photos[index].title || "No Title";
    });
}

// Function to add a custom tag to the photo
function addCustomTag() {
    const tagText = document.getElementById('manualTagInput').value.trim();
    if (tagText && currentPhoto) {
        if (!currentPhoto.tags.includes(tagText)) {
            currentPhoto.tags.push(tagText);
            document.getElementById('manualTagsOutput').appendChild(createLabel(tagText));
            document.getElementById('manualTagInput').value = '';
            updatePhotoInIndexedDB(currentPhoto);
        }
    }
}

// Function to create a tag or author label with a delete button
function createLabel(text) {
    const label = document.createElement('div');
    label.className = 'label';
    label.textContent = text;

    const deleteButton = document.createElement('span');
    deleteButton.textContent = ' x';
    deleteButton.style.cursor = 'pointer';
    deleteButton.style.marginLeft = '8px';
    deleteButton.onclick = () => {
        if (currentPhoto) {
            currentPhoto.tags = currentPhoto.tags.filter(tag => tag !== text);
            currentPhoto.author = currentPhoto.author === text ? '' : currentPhoto.author;
            label.remove();
            updatePhotoInIndexedDB(currentPhoto);
        }
    };

    label.appendChild(deleteButton);
    return label;
}

// Delete a photo
function deletePhoto(photo, photoTile) {
    if (confirm("Are you sure you want to delete this photo?")) {
        photos = photos.filter(p => p.id !== photo.id);
        photoTile.remove();
        deletePhotoFromIndexedDB(photo.id);
    }
}

// Delete a photo from IndexedDB
function deletePhotoFromIndexedDB(photoId) {
    const transaction = db.transaction(['photos'], 'readwrite');
    const objectStore = transaction.objectStore('photos');
    objectStore.delete(photoId);

    transaction.oncomplete = () => {
        console.log('Photo deleted from IndexedDB');
    };

    transaction.onerror = (event) => {
        console.error('Error deleting photo from IndexedDB:', event.target.error);
    };
}

// Night Mode Toggle
document.getElementById('nightModeSwitch').addEventListener('change', function() {
    if (this.checked) {
        document.body.classList.add('night-mode');
    } else {
        document.body.classList.remove('night-mode');
    }
});

// Function to export titles, tags, and authors to a spreadsheet
function exportToSpreadsheet() {
    // Sort photos chronologically based on metadata if available
    photos.sort((a, b) => {
        const dateA = a.metadata.DateTimeOriginal ? new Date(a.metadata.DateTimeOriginal.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3')) : new Date();
        const dateB = b.metadata.DateTimeOriginal ? new Date(b.metadata.DateTimeOriginal.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3')) : new Date();
        return dateA - dateB;
    });

    // Create a new workbook and worksheet
    const wb = XLSX.utils.book_new();
    const ws_data = [];

    // Add headers
    ws_data.push(["Title", "Time/Date", "Device", "Other Tags", "Author"]);

    // Add data rows
    photos.forEach(photo => {
        const timeTag = photo.metadata.DateTimeOriginal ? formatDateTime(photo.metadata.DateTimeOriginal) : "No Date";
        const deviceTag = photo.metadata.Make && photo.metadata.Model ? `${photo.metadata.Make} ${photo.metadata.Model}` : "No Device";
        const otherTags = photo.tags.filter(tag => tag !== timeTag && tag !== deviceTag).join(", ") || "No Tags";
        const author = photo.author || "No Author";

        ws_data.push([photo.title || "No Title", timeTag, deviceTag, otherTags, author]);
    });

    const ws = XLSX.utils.aoa_to_sheet(ws_data);

    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(wb, ws, "Photos");

    // Create the file name with the current date
    const fileName = `ACCD EOP Photo Library - ${formatDate()}.xlsx`;

    // Generate Excel file and trigger download
    XLSX.writeFile(wb, fileName);
}

// Attach the export function to the export button
document.getElementById('exportButton').addEventListener('click', exportToSpreadsheet);

// Function to format the date and time for the filename
function formatDate() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Function to format the DateTimeOriginal metadata
function formatDateTime(dateTime) {
    const date = new Date(dateTime.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3'));
    return date.toLocaleString();
}

// Open the database when the page loads
window.onload = openDatabase;

// Function to filter photos based on search input
function filterPhotos(searchTerm) {
    const gallery = document.getElementById('gallery');
    gallery.innerHTML = ''; // Clear the gallery before displaying filtered photos

    const filteredPhotos = photos.filter(photo => {
        const titleMatch = photo.title.toLowerCase().includes(searchTerm.toLowerCase());
        const tagsMatch = photo.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()));
        return titleMatch || tagsMatch;
    });

    filteredPhotos.forEach(photo => addPhotoToGallery(photo));
}

// Attach the filter function to the search input
document.getElementById('searchInput').addEventListener('input', (e) => {
    const searchTerm = e.target.value;
    filterPhotos(searchTerm);
});

// Function to add a photo to the gallery
function addPhotoToGallery(photo) {
    const gallery = document.getElementById('gallery');
    const photoTile = document.createElement('div');
    photoTile.className = 'photo-tile';

    const img = document.createElement('img');
    img.src = photo.src;
    img.alt = photo.title || "Uploaded Photo";
    img.addEventListener('click', () => showPhotoDetails(photo)); // Make thumbnail clickable

    const titleDiv = document.createElement('div');
    titleDiv.className = 'photo-title';
    titleDiv.textContent = photo.title || "No Title";

    const quickActionsDiv = document.createElement('div');
    quickActionsDiv.className = 'quick-actions';

    const editButton = document.createElement('button');
    editButton.textContent = 'Edit';
    editButton.onclick = () => {
        showPhotoDetails(photo);
    };

    const deleteButton = document.createElement('button');
    deleteButton.textContent = 'Delete';
    deleteButton.onclick = () => {
        deletePhoto(photo, photoTile);
    };

    quickActionsDiv.appendChild(editButton);
    quickActionsDiv.appendChild(deleteButton);

    photoTile.appendChild(img);
    photoTile.appendChild(titleDiv);
    photoTile.appendChild(quickActionsDiv);
    gallery.appendChild(photoTile);
}

// Rest of the functions...

// Open the database when the page loads
window.onload = openDatabase;

// Function to add a photo to the gallery
function addPhotoToGallery(photo) {
    const gallery = document.getElementById('gallery');
    const photoTile = document.createElement('div');
    photoTile.className = 'photo-tile';

    const img = document.createElement('img');
    img.src = photo.src;
    img.alt = photo.title || "Uploaded Photo";
    img.addEventListener('click', () => showPhotoDetails(photo)); // Make thumbnail clickable

    const titleDiv = document.createElement('div');
    titleDiv.className = 'photo-title';
    titleDiv.textContent = photo.title || "No Title";

    const quickActionsDiv = document.createElement('div');
    quickActionsDiv.className = 'quick-actions';

    const editButton = document.createElement('button');
    editButton.textContent = 'Edit';
    editButton.onclick = () => {
        showPhotoDetails(photo);
    };

    const deleteButton = document.createElement('button');
    deleteButton.textContent = 'Delete';
    deleteButton.onclick = () => {
        deletePhoto(photo, photoTile);
    };

    quickActionsDiv.appendChild(editButton);
    quickActionsDiv.appendChild(deleteButton);

    photoTile.appendChild(img);
    photoTile.appendChild(titleDiv);
    photoTile.appendChild(quickActionsDiv);
    gallery.appendChild(photoTile);
}

// Show the photo details
function showPhotoDetails(photo) {
    currentPhoto = photo;
    document.getElementById('detailImage').src = photo.src;
    document.getElementById('titleInput').value = photo.title;
    document.getElementById('manualTagsOutput').innerHTML = '';
    document.getElementById('authorOutput').innerHTML = '';

    // Display existing tags (including auto-generated tags)
    photo.tags.forEach(tag => {
        document.getElementById('manualTagsOutput').appendChild(createLabel(tag));
    });

    // Display existing author
    if (photo.author) {
        document.getElementById('authorOutput').appendChild(createLabel(photo.author));
    }

    const detailSection = document.getElementById('detailSection');
    detailSection.style.display = 'block';
    detailSection.scrollIntoView({ behavior: 'smooth', block: 'center' });

    document.getElementById('saveTitleButton').disabled = false;
    document.getElementById('saveTitleButton').onclick = saveTitle;

    document.getElementById('editTitleButton').onclick = () => {
        document.getElementById('titleInput').disabled = false;
        document.getElementById('saveTitleButton').disabled = false;
    };

    document.getElementById('addTagButton').onclick = addCustomTag;

    // Handle author buttons
    document.querySelectorAll('.author-button').forEach(button => {
        button.addEventListener('click', () => {
            const authorText = button.getAttribute('data-author');
            currentPhoto.author = authorText;
            document.getElementById('authorOutput').innerHTML = ''; // Clear previous output
            document.getElementById('authorOutput').appendChild(createLabel(authorText));
            updatePhotoInIndexedDB(currentPhoto);
        });
    });

    // Handle manual author input
    document.getElementById('addAuthorButton').onclick = () => {
        const authorText = document.getElementById('manualAuthorInput').value.trim();
        if (authorText) {
            currentPhoto.author = authorText;
            document.getElementById('authorOutput').innerHTML = ''; // Clear previous output
            document.getElementById('authorOutput').appendChild(createLabel(authorText));
            updatePhotoInIndexedDB(currentPhoto);
            document.getElementById('manualAuthorInput').value = ''; // Clear input field
        }
    };

    // Handle pre-selected tag buttons
    document.querySelectorAll('.pre-tag-button').forEach(button => {
        button.addEventListener('click', () => {
            const tagText = button.getAttribute('data-tag');
            if (currentPhoto && !currentPhoto.tags.includes(tagText)) {
                currentPhoto.tags.push(tagText);
                document.getElementById('manualTagsOutput').appendChild(createLabel(tagText));
                updatePhotoInIndexedDB(currentPhoto);
            }
        });
    });

    // Add download button functionality
    document.getElementById('downloadButton').onclick = () => downloadImage(photo);
}

// Function to download the current image
function downloadImage(photo) {
    const link = document.createElement('a');
    link.href = photo.src;
    link.download = photo.title || 'downloaded_image';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Add download button in the HTML (in showPhotoDetails function)
// Make sure the download button is in your HTML file as well.