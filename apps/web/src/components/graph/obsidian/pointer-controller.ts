export interface CanvasPointerCallbacks {
  onContextMenu: (offsetX: number, offsetY: number) => void;
  onWheel: (delta: number, offsetX: number, offsetY: number) => void;
  onPointerDown: (offsetX: number, offsetY: number, clientX: number, clientY: number) => void;
  onPointerMove: (offsetX: number, offsetY: number, clientX: number, clientY: number, pointerType: string) => void;
  onPointerRelease: () => void;
  onPointerLeave: () => void;
}

export interface GraphPointerHost {
  hitTest: (cssX: number, cssY: number) => number;
  screenToWorld: (x: number, y: number) => { x: number; y: number };
  nodeIdAt: (index: number) => string | null;
  getPan: () => { panX: number; panY: number };
  setPan: (panX: number, panY: number) => void;
  moveNode: (index: number, x: number, y: number) => void;
  postDragForce: (id: string, x: number | null, y: number | null) => void;
  onWheelZoom: (delta: number, offsetCssX: number, offsetCssY: number) => void;
  onContext?: (id: string, cssX: number, cssY: number) => void;
  onActivate?: (id: string) => void;
  onSelectionChanged: (activeIndex: number) => void;
  requestRender: () => void;
}

const WHEEL_LINE_PX = 40;
const WHEEL_PAGE_PX = 800;

/** 绑定画布底层 DOM 事件并返回卸载函数，确保销毁时零残留监听。 */
export function bindCanvasPointerEvents(
  canvas: HTMLCanvasElement,
  callbacks: CanvasPointerCallbacks,
): () => void {
  const onContextMenu = (event: MouseEvent) => {
    event.preventDefault();
    callbacks.onContextMenu(event.offsetX, event.offsetY);
  };
  const onWheel = (event: WheelEvent) => {
    event.preventDefault();
    let delta = event.deltaY;
    if (event.deltaMode === 1) delta *= WHEEL_LINE_PX;
    if (event.deltaMode === 2) delta *= WHEEL_PAGE_PX;
    callbacks.onWheel(delta, event.offsetX, event.offsetY);
  };
  const onPointerDown = (event: PointerEvent) => {
    canvas.setPointerCapture?.(event.pointerId);
    callbacks.onPointerDown(event.offsetX, event.offsetY, event.clientX, event.clientY);
  };
  const onPointerMove = (event: PointerEvent) => {
    callbacks.onPointerMove(event.offsetX, event.offsetY, event.clientX, event.clientY, event.pointerType);
  };
  const onRelease = (event: PointerEvent) => {
    canvas.releasePointerCapture?.(event.pointerId);
    callbacks.onPointerRelease();
  };
  const onPointerLeave = () => { callbacks.onPointerLeave(); };

  canvas.addEventListener('contextmenu', onContextMenu);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onRelease);
  canvas.addEventListener('pointercancel', onRelease);
  canvas.addEventListener('pointerleave', onPointerLeave);

  return () => {
    canvas.removeEventListener('contextmenu', onContextMenu);
    canvas.removeEventListener('wheel', onWheel);
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerup', onRelease);
    canvas.removeEventListener('pointercancel', onRelease);
    canvas.removeEventListener('pointerleave', onPointerLeave);
  };
}

/** 托管拖拽节点、平移画布、悬停高亮与右键触发的交互状态机。 */
export function attachGraphPointerController(canvas: HTMLCanvasElement, host: GraphPointerHost) {
  let hovered = -1;
  let dragging = -1;
  let panning = false;
  let panStart: { x: number; y: number; panX: number; panY: number } | null = null;
  let movedSinceDown = false;

  const notifySelection = () => host.onSelectionChanged(dragging >= 0 ? dragging : hovered);

  const unbind = bindCanvasPointerEvents(canvas, {
    onContextMenu: (offsetX, offsetY) => {
      const id = host.nodeIdAt(host.hitTest(offsetX, offsetY));
      if (id && host.onContext) host.onContext(id, offsetX, offsetY);
    },
    onWheel: (delta, offsetX, offsetY) => host.onWheelZoom(delta, offsetX, offsetY),
    onPointerDown: (offsetX, offsetY, clientX, clientY) => {
      movedSinceDown = false;
      const index = host.hitTest(offsetX, offsetY);
      const dpr = window.devicePixelRatio || 1;
      if (index >= 0) {
        dragging = index;
        const world = host.screenToWorld(offsetX * dpr, offsetY * dpr);
        host.moveNode(index, world.x, world.y);
        const id = host.nodeIdAt(index);
        if (id) host.postDragForce(id, world.x, world.y);
        notifySelection();
      } else {
        panning = true;
        canvas.classList.add('is-grabbing');
        panStart = { x: clientX * dpr, y: clientY * dpr, ...host.getPan() };
      }
      host.requestRender();
    },
    onPointerMove: (offsetX, offsetY, clientX, clientY, pointerType) => {
      const dpr = window.devicePixelRatio || 1;
      if (dragging >= 0) {
        movedSinceDown = true;
        const id = host.nodeIdAt(dragging);
        if (id) {
          const world = host.screenToWorld(offsetX * dpr, offsetY * dpr);
          host.moveNode(dragging, world.x, world.y);
          host.postDragForce(id, world.x, world.y);
        }
      } else if (panning && panStart) {
        host.setPan(panStart.panX + clientX * dpr - panStart.x, panStart.panY + clientY * dpr - panStart.y);
      } else if (pointerType === 'mouse') {
        const index = host.hitTest(offsetX, offsetY);
        const next = index >= 0 ? index : -1;
        if (next !== hovered) {
          hovered = next;
          notifySelection();
        }
        canvas.style.cursor = next >= 0 ? 'pointer' : 'grab';
      }
      host.requestRender();
    },
    onPointerRelease: () => {
      if (dragging >= 0) {
        const id = host.nodeIdAt(dragging);
        if (id) {
          host.postDragForce(id, null, null);
          if (!movedSinceDown) host.onActivate?.(id);
        }
        dragging = -1;
      }
      panning = false;
      panStart = null;
      canvas.classList.remove('is-grabbing');
      notifySelection();
      host.requestRender();
    },
    onPointerLeave: () => {
      if (dragging < 0 && !panning && hovered >= 0) {
        hovered = -1;
        notifySelection();
        host.requestRender();
      }
    },
  });

  return {
    unbind,
    reset: (): void => {
      hovered = -1;
      dragging = -1;
      panning = false;
      panStart = null;
      movedSinceDown = false;
      canvas.classList.remove('is-grabbing');
    },
    setHoveredIndex: (index: number): boolean => {
      if (index === hovered) return false;
      hovered = index;
      notifySelection();
      return true;
    },
    activeIndex: () => (dragging >= 0 ? dragging : hovered),
  };
}
