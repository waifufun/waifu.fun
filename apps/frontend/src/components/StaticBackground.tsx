/**
 * Static full-page background layer. Replaces the animated InteractiveBackground
 * when it's disabled, so the same paint order is kept and no white flash occurs.
 * When InteractiveBackground is re-enabled, keep this behind it or remove it.
 */
export default function StaticBackground() {
	return <div className="fixed inset-0 z-0 pointer-events-none" style={{ backgroundColor: "#08080a" }} aria-hidden />;
}
