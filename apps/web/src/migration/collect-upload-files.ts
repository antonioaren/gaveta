export interface UploadFileEntry {
  readonly relativePath: string;
  readonly bytes: Uint8Array;
}

function isMarkdownOrAttachment(name: string): boolean {
  const lower = name.toLowerCase();
  if (lower.endsWith('.md')) {
    return true;
  }
  const attachmentExt = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.pdf'];
  return attachmentExt.some((ext) => lower.endsWith(ext));
}

async function readFileEntry(file: File, prefix: string): Promise<UploadFileEntry | null> {
  if (!isMarkdownOrAttachment(file.name)) {
    return null;
  }
  const relativePath = prefix.length === 0 ? file.name : `${prefix}/${file.name}`;
  const buffer = await file.arrayBuffer();
  return { relativePath, bytes: new Uint8Array(buffer) };
}

async function walkEntry(entry: FileSystemEntry, prefix: string): Promise<UploadFileEntry[]> {
  if (entry.isFile) {
    const fileEntry = entry as FileSystemFileEntry;
    const file = await new Promise<File>((resolve, reject) => {
      fileEntry.file(resolve, reject);
    });
    const read = await readFileEntry(file, prefix);
    return read === null ? [] : [read];
  }
  if (!entry.isDirectory) {
    return [];
  }
  const dir = entry as FileSystemDirectoryEntry;
  const children = await new Promise<FileSystemEntry[]>((resolve, reject) => {
    const reader = dir.createReader();
    const collected: FileSystemEntry[] = [];
    const readBatch = (): void => {
      reader.readEntries((batch) => {
        if (batch.length === 0) {
          resolve(collected);
          return;
        }
        collected.push(...batch);
        readBatch();
      }, reject);
    };
    readBatch();
  });
  const nextPrefix = prefix.length === 0 ? entry.name : `${prefix}/${entry.name}`;
  const nested: UploadFileEntry[] = [];
  for (const child of children) {
    if (child.name === '.obsidian' || child.name === '.git') {
      continue;
    }
    nested.push(...(await walkEntry(child, nextPrefix)));
  }
  return nested;
}

export async function collectUploadFilesFromDataTransfer(
  dataTransfer: DataTransfer,
): Promise<UploadFileEntry[]> {
  const items = [...dataTransfer.items];
  const fromEntries: UploadFileEntry[] = [];
  for (const item of items) {
    const entry = item.webkitGetAsEntry() ?? null;
    if (entry !== null) {
      fromEntries.push(...(await walkEntry(entry, '')));
      continue;
    }
    const file = item.getAsFile();
    if (file !== null) {
      const read = await readFileEntry(file, '');
      if (read !== null) {
        fromEntries.push(read);
      }
    }
  }
  if (fromEntries.length > 0) {
    return fromEntries;
  }
  const files = [...dataTransfer.files];
  const plain: UploadFileEntry[] = [];
  for (const file of files) {
    const read = await readFileEntry(file, '');
    if (read !== null) {
      plain.push(read);
    }
  }
  return plain;
}

export async function collectUploadFilesFromFileList(
  fileList: FileList,
): Promise<UploadFileEntry[]> {
  const entries: UploadFileEntry[] = [];
  for (const file of [...fileList]) {
    const relative = file.webkitRelativePath.length > 0 ? file.webkitRelativePath : file.name;
    if (!isMarkdownOrAttachment(relative)) {
      continue;
    }
    const buffer = await file.arrayBuffer();
    entries.push({ relativePath: relative.replace(/\\/g, '/'), bytes: new Uint8Array(buffer) });
  }
  return entries;
}
