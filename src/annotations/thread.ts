// ============================================================
// Domnotate — Thread Model
// ============================================================

import type { Comment } from '@/types/core';

export interface ThreadNode extends Comment {
  replies: ThreadNode[];
  depth: number;
}

/**
 * Build a tree of ThreadNodes from a flat array of Comments.
 * Root nodes have parentId === null. Siblings are sorted by createdAt ascending.
 */
export function buildThread(comments: Comment[]): ThreadNode[] {
  const nodeMap = new Map<string, ThreadNode>();
  const roots: ThreadNode[] = [];

  // Create ThreadNode wrappers for every comment
  for (const comment of comments) {
    nodeMap.set(comment.id, {
      ...comment,
      replies: [],
      depth: 0,
    });
  }

  // Wire parent → child relationships
  for (const comment of comments) {
    const node = nodeMap.get(comment.id)!;

    if (comment.parentId === null) {
      roots.push(node);
    } else {
      const parent = nodeMap.get(comment.parentId);
      if (parent) {
        node.depth = parent.depth + 1;
        parent.replies.push(node);
      } else {
        // Orphaned reply — treat as root
        roots.push(node);
      }
    }
  }

  // Sort siblings by createdAt ascending (recursive)
  const sortByCreatedAt = (a: ThreadNode, b: ThreadNode) =>
    a.createdAt.localeCompare(b.createdAt);

  function sortReplies(nodes: ThreadNode[]): void {
    nodes.sort(sortByCreatedAt);
    for (const node of nodes) {
      sortReplies(node.replies);
    }
  }

  sortReplies(roots);

  return roots;
}

/**
 * Depth-first flatten of a thread tree for linear display.
 * Each node retains its depth property for indentation.
 */
export function flattenThread(nodes: ThreadNode[]): ThreadNode[] {
  const result: ThreadNode[] = [];

  function walk(list: ThreadNode[]): void {
    for (const node of list) {
      result.push(node);
      walk(node.replies);
    }
  }

  walk(nodes);
  return result;
}
