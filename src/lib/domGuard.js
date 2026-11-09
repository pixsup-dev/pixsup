// Google Translate and some browser extensions (Grammarly and the like) rewrite
// the page's text behind React's back. When React later updates that part of
// the page, the nodes it put there are gone and the whole app crashes with
// "Failed to execute 'insertBefore' on 'Node'". This makes those two calls skip
// quietly instead (the known fix from github.com/facebook/react/issues/11538).
export function guardAgainstPageTranslators() {
  if (typeof Node !== "function" || !Node.prototype) return;

  const removeChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function (child) {
    if (child.parentNode !== this) return child;
    return removeChild.call(this, child);
  };

  const insertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function (newNode, referenceNode) {
    if (referenceNode && referenceNode.parentNode !== this) return newNode;
    return insertBefore.call(this, newNode, referenceNode);
  };
}
