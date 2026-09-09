// KOSIF attachment manager
// Handles local attachment lifecycle before secure upload integration.
export function createAttachmentManager({ onChange } = {}) {
  const files = [];

  function add(list) {
    for (const file of list || []) {
      if (!files.some((item) => item.name === file.name && item.size === file.size)) {
        files.push(file);
      }
    }
    onChange?.([...files]);
    return [...files];
  }

  function remove(name) {
    const index = files.findIndex((file) => file.name === name);
    if (index >= 0) files.splice(index, 1);
    onChange?.([...files]);
    return [...files];
  }

  function clear() {
    files.length = 0;
    onChange?.([]);
  }

  return { add, remove, clear, list: () => [...files] };
}
