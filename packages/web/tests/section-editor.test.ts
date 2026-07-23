// @vitest-environment happy-dom
//
// Tests for packages/web/src/section-editor.ts.
//
// happy-dom gives us a real document/Element/HTMLInputElement so the
// module's createElement / querySelector / textContent / value work
// exactly like in the browser. Per-test we build a minimal modal
// fragment, pass it via `dom`, and assert on the rendered + saved state.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// parseMusicXmlMetadata is from @piano/core; mock it so tests don't have
// to construct real MusicXML. We only care that its return drives the
// "X measures" prefill + bounds-check.
vi.mock('@piano/core', () => ({
  parseMusicXmlMetadata: vi.fn(() => ({ measureCount: 100 })),
}));

import { parseMusicXmlMetadata } from '@piano/core';
import { createSectionEditor, type SectionEditorDeps } from '../src/section-editor';

/** Build a minimal section-editor modal in the live happy-dom document
 *  and return the same SectionEditorDom shape the shell wires in. */
function makeDom() {
  document.body.innerHTML = `
    <div id="modal" class="">
      <div id="help"></div>
      <div id="rows"></div>
      <div id="error"></div>
      <button id="cancel"></button>
      <button id="save"></button>
      <button id="close"></button>
    </div>
  `;
  return {
    modal: document.getElementById('modal') as HTMLElement,
    help: document.getElementById('help') as HTMLElement,
    rows: document.getElementById('rows') as HTMLElement,
    error: document.getElementById('error') as HTMLElement,
    cancelBtn: document.getElementById('cancel'),
    saveBtn: document.getElementById('save'),
    closeBtn: document.getElementById('close'),
  };
}

/** Build a fake IDBDatabase that returns the canned record from the
 *  user-songs object store. Mimics the legacy `transaction(...).objectStore(...).get(id)`
 *  pattern: returns an object with onsuccess/onerror handlers + .result. */
function makeDb(record: unknown) {
  return {
    transaction: () => ({
      objectStore: () => ({
        get: () => {
          const req: { result: unknown; onsuccess?: () => void; onerror?: () => void } = {
            result: record,
          };
          // Fire onsuccess on next microtask to mimic IDB async behavior.
          queueMicrotask(() => req.onsuccess?.());
          return req;
        },
      }),
    }),
  } as unknown as IDBDatabase;
}

/** Build a complete deps object with all callable stubs as vi.fn()s. */
function makeDeps(record: unknown, overrides: Partial<SectionEditorDeps> = {}): SectionEditorDeps {
  return {
    dom: makeDom(),
    openUserDb: vi.fn(() => Promise.resolve(makeDb(record))),
    userDbStoreName: 'userSongs',
    unzipMxlToXmlText: vi.fn(() => Promise.resolve('<score-partwise/>')),
    userDbPut: vi.fn(() => Promise.resolve()),
    t: vi.fn((key, vars) => (vars ? `${key}{${JSON.stringify(vars)}}` : key)),
    modalFocus: { open: vi.fn(), close: vi.fn() },
    onSaved: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('createSectionEditor — open()', () => {
  it('returns silently when the record does not exist', async () => {
    const deps = makeDeps(null);
    const editor = createSectionEditor(deps);
    await editor.open('nonexistent');
    // Modal should NOT be marked visible.
    expect(deps.dom.modal.classList.contains('visible')).toBe(false);
    expect(deps.modalFocus.open).not.toHaveBeenCalled();
  });

  it('uses cached xmlText when present (skips unzip)', async () => {
    const deps = makeDeps({
      id: 'u1',
      mimeType: 'application/vnd.recordare.musicxml+zip',
      mxlBlob: new Blob(),
      xmlText: '<cached-xml/>',
      sectionDefs: [],
    });
    const editor = createSectionEditor(deps);
    await editor.open('u1');
    expect(deps.unzipMxlToXmlText).not.toHaveBeenCalled();
  });

  it('unzips when xmlText is missing on .mxl records', async () => {
    const deps = makeDeps({
      id: 'u1',
      mimeType: 'application/vnd.recordare.musicxml+zip',
      mxlBlob: new Blob(),
      sectionDefs: [],
    });
    const editor = createSectionEditor(deps);
    await editor.open('u1');
    expect(deps.unzipMxlToXmlText).toHaveBeenCalledOnce();
  });

  it('reads .text() directly when mimeType is plain MusicXML', async () => {
    const blob = new Blob(['<plain-xml/>'], { type: 'application/vnd.recordare.musicxml+xml' });
    blob.text = vi.fn(() => Promise.resolve('<plain-xml/>'));
    const deps = makeDeps({
      id: 'u1',
      mimeType: 'application/vnd.recordare.musicxml+xml',
      mxlBlob: blob,
      sectionDefs: [],
    });
    const editor = createSectionEditor(deps);
    await editor.open('u1');
    expect(deps.unzipMxlToXmlText).not.toHaveBeenCalled();
    expect(blob.text).toHaveBeenCalledOnce();
  });

  it('renders 3 input rows with prefilled startMeasure values (1-based)', async () => {
    const deps = makeDeps({
      id: 'u1',
      mimeType: 'application/vnd.recordare.musicxml+xml',
      mxlBlob: { text: () => Promise.resolve('<x/>') } as unknown as Blob,
      sectionDefs: [
        { id: 'A1', nameKey: 'userSecA1', descKey: 'userSecA1desc', startMeasure: 0 },
        { id: 'B', nameKey: 'userSecB', descKey: 'userSecBdesc', startMeasure: 30 },
        { id: 'A2', nameKey: 'userSecA2', descKey: 'userSecA2desc', startMeasure: 70 },
      ],
    });
    const editor = createSectionEditor(deps);
    await editor.open('u1');
    const inputs = deps.dom.rows.querySelectorAll<HTMLInputElement>('input[type=number]');
    expect(inputs).toHaveLength(3);
    // 0-based → 1-based for display
    expect(inputs[0]?.value).toBe('1');
    expect(inputs[1]?.value).toBe('31');
    expect(inputs[2]?.value).toBe('71');
  });

  it('C4: renders a SINGLE row for a < 3-measure score (was unsavable with 3)', async () => {
    vi.mocked(parseMusicXmlMetadata).mockReturnValueOnce({ measureCount: 2 } as never);
    const deps = makeDeps({
      id: 'u1',
      mimeType: 'application/vnd.recordare.musicxml+xml',
      mxlBlob: { text: () => Promise.resolve('<x/>') } as unknown as Blob,
      sectionDefs: [{ id: 'A1', nameKey: 'userSecA1', descKey: 'userSecA1desc', startMeasure: 0 }],
    });
    const editor = createSectionEditor(deps);
    await editor.open('u1');
    const inputs = deps.dom.rows.querySelectorAll<HTMLInputElement>('input[type=number]');
    expect(inputs).toHaveLength(1);
    expect(inputs[0]?.value).toBe('1');
  });

  it('C4: a 1-row short song SAVES (single A1 def, no unsatisfiable B/A2 check)', async () => {
    vi.mocked(parseMusicXmlMetadata).mockReturnValueOnce({ measureCount: 2 } as never);
    const rec = {
      id: 'u1',
      mimeType: 'application/vnd.recordare.musicxml+xml',
      mxlBlob: { text: () => Promise.resolve('<x/>') } as unknown as Blob,
      sectionDefs: [{ id: 'A1', nameKey: 'userSecA1', descKey: 'userSecA1desc', startMeasure: 0 }],
    };
    const deps = makeDeps(rec);
    const editor = createSectionEditor(deps);
    await editor.open('u1');
    (deps.dom.saveBtn as HTMLElement).click();
    await Promise.resolve();
    await Promise.resolve();
    expect(deps.dom.error.textContent).toBe(''); // no validation error
    expect(deps.userDbPut).toHaveBeenCalledOnce();
    expect(deps.onSaved).toHaveBeenCalledOnce();
  });

  it('disables the first input (A1 always starts at measure 1)', async () => {
    const deps = makeDeps({
      id: 'u1',
      mimeType: 'application/vnd.recordare.musicxml+xml',
      mxlBlob: { text: () => Promise.resolve('<x/>') } as unknown as Blob,
      sectionDefs: [],
    });
    const editor = createSectionEditor(deps);
    await editor.open('u1');
    const inputs = deps.dom.rows.querySelectorAll<HTMLInputElement>('input[type=number]');
    expect(inputs[0]?.disabled).toBe(true);
    expect(inputs[1]?.disabled).toBe(false);
    expect(inputs[2]?.disabled).toBe(false);
  });

  it('falls back to thirds when sectionDefs is empty', async () => {
    const deps = makeDeps({
      id: 'u1',
      mimeType: 'application/vnd.recordare.musicxml+xml',
      mxlBlob: { text: () => Promise.resolve('<x/>') } as unknown as Blob,
      sectionDefs: [],
    });
    const editor = createSectionEditor(deps);
    await editor.open('u1');
    const inputs = deps.dom.rows.querySelectorAll<HTMLInputElement>('input[type=number]');
    // total=100, fallback = floor(i*100/3) → 0, 33, 66 (0-based) → 1, 34, 67 (1-based)
    expect(inputs[0]?.value).toBe('1');
    expect(inputs[1]?.value).toBe('34');
    expect(inputs[2]?.value).toBe('67');
  });

  it('marks modal visible + opens modal focus stack', async () => {
    const deps = makeDeps({
      id: 'u1',
      mimeType: 'application/vnd.recordare.musicxml+xml',
      mxlBlob: { text: () => Promise.resolve('<x/>') } as unknown as Blob,
      sectionDefs: [],
    });
    const editor = createSectionEditor(deps);
    await editor.open('u1');
    expect(deps.dom.modal.classList.contains('visible')).toBe(true);
    expect(deps.modalFocus.open).toHaveBeenCalledWith(deps.dom.modal);
  });

  it('caps input.max at the score measure count', async () => {
    const deps = makeDeps({
      id: 'u1',
      mimeType: 'application/vnd.recordare.musicxml+xml',
      mxlBlob: { text: () => Promise.resolve('<x/>') } as unknown as Blob,
      sectionDefs: [],
    });
    const editor = createSectionEditor(deps);
    await editor.open('u1');
    const inputs = deps.dom.rows.querySelectorAll<HTMLInputElement>('input[type=number]');
    expect(inputs[0]?.max).toBe('100');
    expect(inputs[1]?.max).toBe('100');
    expect(inputs[2]?.max).toBe('100');
  });
});

describe('createSectionEditor — close()', () => {
  it('removes visible class + closes modal focus + clears editing state', async () => {
    const deps = makeDeps({
      id: 'u1',
      mimeType: 'application/vnd.recordare.musicxml+xml',
      mxlBlob: { text: () => Promise.resolve('<x/>') } as unknown as Blob,
      sectionDefs: [],
    });
    const editor = createSectionEditor(deps);
    await editor.open('u1');
    expect(deps.dom.modal.classList.contains('visible')).toBe(true);
    editor.close();
    expect(deps.dom.modal.classList.contains('visible')).toBe(false);
    expect(deps.modalFocus.close).toHaveBeenCalledWith(deps.dom.modal);
  });

  it('fires when the cancel button is clicked', async () => {
    const deps = makeDeps({
      id: 'u1',
      mimeType: 'application/vnd.recordare.musicxml+xml',
      mxlBlob: { text: () => Promise.resolve('<x/>') } as unknown as Blob,
      sectionDefs: [],
    });
    createSectionEditor(deps); // installs internal click listener
    await Promise.resolve(); // settle microtasks
    deps.dom.modal.classList.add('visible');
    (deps.dom.cancelBtn as HTMLElement).click();
    expect(deps.dom.modal.classList.contains('visible')).toBe(false);
  });

  it('fires when clicking the modal backdrop (target === modal)', async () => {
    const deps = makeDeps({
      id: 'u1',
      mimeType: 'application/vnd.recordare.musicxml+xml',
      mxlBlob: { text: () => Promise.resolve('<x/>') } as unknown as Blob,
      sectionDefs: [],
    });
    createSectionEditor(deps);
    deps.dom.modal.classList.add('visible');
    deps.dom.modal.click();
    expect(deps.dom.modal.classList.contains('visible')).toBe(false);
  });
});

describe('createSectionEditor — save() validation', () => {
  /** Helper: open + click save with the given values in the 3 inputs. */
  async function runSaveWith(
    record: unknown,
    inputValues: [string, string, string]
  ): Promise<{ deps: ReturnType<typeof makeDeps> }> {
    const deps = makeDeps(record);
    const editor = createSectionEditor(deps);
    await editor.open('u1');
    const inputs = deps.dom.rows.querySelectorAll<HTMLInputElement>('input[type=number]');
    // First is locked at '1'; only set if needed
    if (inputValues[0]) inputs[0]!.disabled = false;
    inputs[0]!.value = inputValues[0]!;
    inputs[1]!.value = inputValues[1]!;
    inputs[2]!.value = inputValues[2]!;
    (deps.dom.saveBtn as HTMLElement).click();
    // Save is async — wait one tick.
    await new Promise((r) => setTimeout(r, 0));
    return { deps };
  }

  const validRecord = {
    id: 'u1',
    mimeType: 'application/vnd.recordare.musicxml+xml',
    mxlBlob: { text: () => Promise.resolve('<x/>') } as unknown as Blob,
    sectionDefs: [],
  };

  it('writes new sectionDefs to IndexedDB on valid 1/B/A2 input', async () => {
    const { deps } = await runSaveWith(validRecord, ['1', '34', '67']);
    expect(deps.userDbPut).toHaveBeenCalledOnce();
    const written = (deps.userDbPut as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(written.sectionDefs).toEqual([
      {
        id: 'A1',
        nameKey: 'userSecA1',
        descKey: 'userSecA1desc',
        startMeasure: 0,
        isBoss: false,
      },
      {
        id: 'B',
        nameKey: 'userSecB',
        descKey: 'userSecBdesc',
        startMeasure: 33,
        isBoss: false,
      },
      {
        id: 'A2',
        nameKey: 'userSecA2',
        descKey: 'userSecA2desc',
        startMeasure: 66,
        isBoss: true,
      },
    ]);
  });

  it('calls onSaved with the patched record after a successful save', async () => {
    const { deps } = await runSaveWith(validRecord, ['1', '34', '67']);
    expect(deps.onSaved).toHaveBeenCalledOnce();
  });

  it('rejects non-monotonic sections (B <= A1)', async () => {
    const { deps } = await runSaveWith(validRecord, ['1', '1', '50']);
    expect(deps.userDbPut).not.toHaveBeenCalled();
    expect(deps.dom.error.textContent).toBe('sectionEditError');
  });

  it('rejects A2 <= B', async () => {
    const { deps } = await runSaveWith(validRecord, ['1', '50', '40']);
    expect(deps.userDbPut).not.toHaveBeenCalled();
    expect(deps.dom.error.textContent).toBe('sectionEditError');
  });

  it('rejects out-of-range values (negative or >= total)', async () => {
    const { deps } = await runSaveWith(validRecord, ['1', '34', '101']);
    expect(deps.userDbPut).not.toHaveBeenCalled();
    expect(deps.dom.error.textContent).toBe('sectionEditError');
  });

  it('rejects when first input is not 1 (A1 must start at measure 1)', async () => {
    const { deps } = await runSaveWith(validRecord, ['2', '34', '67']);
    expect(deps.userDbPut).not.toHaveBeenCalled();
  });

  it('rejects NaN inputs', async () => {
    const { deps } = await runSaveWith(validRecord, ['1', 'abc', '67']);
    expect(deps.userDbPut).not.toHaveBeenCalled();
  });

  it('closes the modal after a valid save', async () => {
    const { deps } = await runSaveWith(validRecord, ['1', '34', '67']);
    expect(deps.dom.modal.classList.contains('visible')).toBe(false);
  });
});
