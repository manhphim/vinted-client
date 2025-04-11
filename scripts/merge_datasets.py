#!/usr/bin/env python3
import os
import json
import csv
import glob
from datetime import datetime

# Configuration
DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data')
OUTPUT_DIR = DATA_DIR

# Updated fields to match the actual schema
CSV_FIELDS = [
    'listing_id', 'listing_name', 'brand', 'listing_description', 'condition', 
    'size', 'listing_url', 'colour', 'favorite', 'views', 'location', 
    'price', 'price_tax', 'total_price', 'payment_option', 'upload_time',
    'processed_at', 'username', 'rating', 'reviewsCount', 'followers',
    'following', 'lastSeen', 'wardrobeQuantity', 'category_id'
]

def get_nested_value(obj, path):
    """Helper to safely get nested object values"""
    keys = path.split('.')
    current = obj
    
    for key in keys:
        if isinstance(current, dict) and key in current:
            current = current[key]
        else:
            return ''
    
    return current if current is not None else ''

def find_date_folders():
    """Find all date folders in the data directory"""
    date_folders = []
    
    for item in os.listdir(DATA_DIR):
        item_path = os.path.join(DATA_DIR, item)
        if os.path.isdir(item_path) and len(item) == 5 and item[2] == '-':
            # Matches format like "28-02"
            date_folders.append(item)
    
    return date_folders

def merge_datasets():
    """Merge all final_dataset.json files into a global dataset"""
    date_folders = find_date_folders()
    all_items = []
    processed_files = 0
    
    print(f"Found {len(date_folders)} date folders")
    
    for date_folder in date_folders:
        date_path = os.path.join(DATA_DIR, date_folder)
        final_dataset_path = os.path.join(date_path, 'final_dataset.json')
        
        if os.path.exists(final_dataset_path):
            try:
                with open(final_dataset_path, 'r', encoding='utf-8') as f:
                    items = json.load(f)
                    
                print(f"Loaded {len(items)} items from {date_folder}/final_dataset.json")
                all_items.extend(items)
                processed_files += 1
            except Exception as e:
                print(f"Error processing {final_dataset_path}: {str(e)}")
    
    # Remove duplicates based on item ID
    unique_items = set()
    for item in all_items:
        if 'listing_id' in item:
            # Convert dict to tuple of items to make it hashable for a set
            item_tuple = tuple(sorted(item.items()))
            unique_items.add(item_tuple)
    
    # Convert back to list of dictionaries
    unique_items_list = [dict(item_tuple) for item_tuple in unique_items]
    
    print(f"Merged {len(all_items)} items from {processed_files} files")
    print(f"After removing duplicates: {len(unique_items_list)} unique items")
    
    # Save the merged dataset
    global_dataset_path = os.path.join(OUTPUT_DIR, 'global_dataset.json')
    with open(global_dataset_path, 'w', encoding='utf-8') as f:
        json.dump(unique_items_list, f, indent=2)
    
    print(f"Saved global dataset to {global_dataset_path}")
    
    return unique_items_list

def convert_to_csv(items):
    """Convert items to CSV format"""
    csv_path = os.path.join(OUTPUT_DIR, 'global_dataset.csv')
    
    with open(csv_path, 'w', encoding='utf-8', newline='') as f:
        writer = csv.writer(f, delimiter=';', quoting=csv.QUOTE_ALL)
        
        # Write header
        writer.writerow(CSV_FIELDS)
        
        # Write data rows
        for item in items:
            row = [get_nested_value(item, field) for field in CSV_FIELDS]
            writer.writerow(row)
    
    print(f"Converted {len(items)} items to CSV: {csv_path}")

def main():
    print(f"Starting dataset merge process at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"Data directory: {DATA_DIR}")
    
    # Merge all datasets
    merged_items = merge_datasets()
    
    # Convert to CSV
    if merged_items:
        convert_to_csv(merged_items)
    
    print(f"Process completed at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

if __name__ == "__main__":
    main()