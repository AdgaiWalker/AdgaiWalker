/**
 * Barnes–Hut 四叉树 —— 按 d3-quadtree 的 `cover` / `add` / `visit` / `visitAfter`
 * 结构逐行等价重写，保证象限划分与遍历顺序严格一致。
 */

type QInternal<T> = {
  children: Array<QNode<T> | undefined>;
  x: number;
  y: number;
  value: number;
  r: number;
};

export type QLeaf<T> = {
  data: T;
  next: QLeaf<T> | null;
  x: number;
  y: number;
  value: number;
  r: number;
};

export type QNode<T> = QInternal<T> | QLeaf<T>;

export function isInternal<T>(node: QNode<T>): node is QInternal<T> {
  return 'children' in node;
}

export class Quadtree<T> {
  private readonly getX: (d: T) => number;
  private readonly getY: (d: T) => number;
  private x0 = Number.NaN;
  private y0 = Number.NaN;
  private x1 = Number.NaN;
  private y1 = Number.NaN;
  private root: QNode<T> | undefined;

  constructor(getX: (d: T) => number, getY: (d: T) => number, data?: readonly T[]) {
    this.getX = getX;
    this.getY = getY;
    if (data) this.addAll(data);
  }

  addAll(data: readonly T[]): this {
    const size = data.length;
    const xs: number[] = new Array(size);
    const ys: number[] = new Array(size);
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (let i = 0; i < size; i += 1) {
      const x = +this.getX(data[i]!);
      const y = +this.getY(data[i]!);
      if (Number.isNaN(x) || Number.isNaN(y)) continue;
      xs[i] = x;
      ys[i] = y;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }

    if (minX > maxX || minY > maxY) return this;

    this.cover(minX, minY).cover(maxX, maxY);

    for (let i = 0; i < size; i += 1) {
      const x = xs[i];
      const y = ys[i];
      if (x === undefined || y === undefined) continue;
      this.insert(x, y, data[i]!);
    }
    return this;
  }

  /** d3 的 cover：把范围扩成正方形（边长取 2 的幂），保证象限划分不退化 */
  cover(inputX: number, inputY: number): this {
    const x = +inputX;
    const y = +inputY;
    if (Number.isNaN(x) || Number.isNaN(y)) return this;

    let x0 = this.x0;
    let y0 = this.y0;
    let x1 = this.x1;
    let y1 = this.y1;

    if (Number.isNaN(x0)) {
      x0 = Math.floor(x);
      x1 = x0 + 1;
      y0 = Math.floor(y);
      y1 = y0 + 1;
    } else {
      let z = x1 - x0 || 1;
      let node: QNode<T> | undefined = this.root;
      let parent: QInternal<T> | undefined;
      let bit = 0;
      while (x < x0 || x >= x1 || y < y0 || y >= y1) {
        bit = ((y < y0 ? 1 : 0) << 1) | (x < x0 ? 1 : 0);
        parent = { children: [undefined, undefined, undefined, undefined], x: 0, y: 0, value: 0, r: 0 };
        parent.children[bit] = node;
        node = parent;
        z *= 2;
        if (bit === 0) {
          x1 = x0 + z;
          y1 = y0 + z;
        } else if (bit === 1) {
          x0 = x1 - z;
          y1 = y0 + z;
        } else if (bit === 2) {
          x1 = x0 + z;
          y0 = y1 - z;
        } else {
          x0 = x1 - z;
          y0 = y1 - z;
        }
      }
      if (this.root && isInternal(this.root)) this.root = node;
    }

    this.x0 = x0;
    this.y0 = y0;
    this.x1 = x1;
    this.y1 = y1;
    return this;
  }

  private insert(x: number, y: number, data: T): void {
    if (Number.isNaN(x) || Number.isNaN(y)) return;

    const leaf: QLeaf<T> = { data, next: null, x: 0, y: 0, value: 0, r: 0 };
    let node: QNode<T> | undefined = this.root;
    if (!node) {
      this.root = leaf;
      return;
    }

    let x0 = this.x0;
    let y0 = this.y0;
    let x1 = this.x1;
    let y1 = this.y1;
    let parent: QInternal<T> | undefined;
    let bit = 0;
    let midX = 0;
    let midY = 0;

    while (isInternal(node)) {
      midX = (x0 + x1) / 2;
      midY = (y0 + y1) / 2;
      const right = x >= midX;
      const bottom = y >= midY;
      if (right) x0 = midX;
      else x1 = midX;
      if (bottom) y0 = midY;
      else y1 = midY;
      bit = ((bottom ? 1 : 0) << 1) | (right ? 1 : 0);
      parent = node;
      const next: QNode<T> | undefined = node.children[bit];
      if (!next) {
        node.children[bit] = leaf;
        return;
      }
      node = next;
    }

    const existingX = +this.getX(node.data);
    const existingY = +this.getY(node.data);

    if (x === existingX && y === existingY) {
      leaf.next = node;
      if (parent) parent.children[bit] = leaf;
      else this.root = leaf;
      return;
    }

    do {
      const bucket: QInternal<T> = {
        children: [undefined, undefined, undefined, undefined],
        x: 0,
        y: 0,
        value: 0,
        r: 0,
      };
      if (parent) parent.children[bit] = bucket;
      else this.root = bucket;
      parent = bucket;

      midX = (x0 + x1) / 2;
      midY = (y0 + y1) / 2;
      const right = x >= midX;
      const bottom = y >= midY;
      if (right) x0 = midX;
      else x1 = midX;
      if (bottom) y0 = midY;
      else y1 = midY;
      bit = ((bottom ? 1 : 0) << 1) | (right ? 1 : 0);

      const existingBit = ((existingY >= midY ? 1 : 0) << 1) | (existingX >= midX ? 1 : 0);
      if (bit !== existingBit) {
        parent.children[existingBit] = node;
        parent.children[bit] = leaf;
        return;
      }
    } while (true);
  }

  visit(
    visitor: (
      node: QNode<T>,
      x0: number,
      y0: number,
      x1: number,
      y1: number,
    ) => boolean | void,
  ): this {
    type Entry = { node: QNode<T>; x0: number; y0: number; x1: number; y1: number };
    const stack: Entry[] = [];
    if (this.root) {
      stack.push({ node: this.root, x0: this.x0, y0: this.y0, x1: this.x1, y1: this.y1 });
    }
    let entry: Entry | undefined;
    while ((entry = stack.pop())) {
      const node = entry.node;
      if (!visitor(node, entry.x0, entry.y0, entry.x1, entry.y1) && isInternal(node)) {
        const midX = (entry.x0 + entry.x1) / 2;
        const midY = (entry.y0 + entry.y1) / 2;
        const children = node.children;
        const child3 = children[3];
        if (child3) stack.push({ node: child3, x0: midX, y0: midY, x1: entry.x1, y1: entry.y1 });
        const child2 = children[2];
        if (child2) stack.push({ node: child2, x0: entry.x0, y0: midY, x1: midX, y1: entry.y1 });
        const child1 = children[1];
        if (child1) stack.push({ node: child1, x0: midX, y0: entry.y0, x1: entry.x1, y1: midY });
        const child0 = children[0];
        if (child0) stack.push({ node: child0, x0: entry.x0, y0: entry.y0, x1: midX, y1: midY });
      }
    }
    return this;
  }

  visitAfter(
    visitor: (node: QNode<T>, x0: number, y0: number, x1: number, y1: number) => void,
  ): this {
    type Entry = { node: QNode<T>; x0: number; y0: number; x1: number; y1: number };
    const pending: Entry[] = [];
    const ordered: Entry[] = [];
    if (this.root) {
      pending.push({ node: this.root, x0: this.x0, y0: this.y0, x1: this.x1, y1: this.y1 });
    }
    let entry: Entry | undefined;
    while ((entry = pending.pop())) {
      if (isInternal(entry.node)) {
        const midX = (entry.x0 + entry.x1) / 2;
        const midY = (entry.y0 + entry.y1) / 2;
        const children = entry.node.children;
        const child0 = children[0];
        if (child0) pending.push({ node: child0, x0: entry.x0, y0: entry.y0, x1: midX, y1: midY });
        const child1 = children[1];
        if (child1) pending.push({ node: child1, x0: midX, y0: entry.y0, x1: entry.x1, y1: midY });
        const child2 = children[2];
        if (child2) pending.push({ node: child2, x0: entry.x0, y0: midY, x1: midX, y1: entry.y1 });
        const child3 = children[3];
        if (child3) pending.push({ node: child3, x0: midX, y0: midY, x1: entry.x1, y1: entry.y1 });
      }
      ordered.push(entry);
    }
    for (let i = ordered.length - 1; i >= 0; i -= 1) {
      const item = ordered[i]!;
      visitor(item.node, item.x0, item.y0, item.x1, item.y1);
    }
    return this;
  }
}
