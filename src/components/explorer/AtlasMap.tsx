import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import {
  SHAPES,
  SHAPE_BY_ID,
  WORLD,
  clampView,
  fitView,
  islandLabelAnchor,
  neighborInDirection,
  placeLabels as layoutLabels,
  project,
  resolveTap,
  shapeAt,
  unitsPerKm,
  viewBox,
  zoomView,
  type Bounds,
  type Candidate,
  type Direction,
  type View,
} from "@/data/pr/geo";
import { NO_DATA_HATCH, NO_DATA_PATTERN_ID } from "@/data/scale";

export type MapVariant = "band" | "detail" | "overview";

/** The hatch every "sin dato publicado" municipio uses. Exported for the regression test. */
export function NoDataPattern() {
  const { base, stripe, size, stripeWidth } = NO_DATA_HATCH;
  return (
    <pattern
      id={NO_DATA_PATTERN_ID}
      width={size}
      height={size}
      patternUnits="userSpaceOnUse"
      patternTransform="rotate(45)"
    >
      <rect width={size} height={size} fill={base} />
      <line x1="0" y1="0" x2="0" y2={size} stroke={stripe} strokeWidth={stripeWidth} />
    </pattern>
  );
}

/** Coastline under the land, then the 78 fills with white borders. Re-renders only when the fills change. */
const MapLand = memo(function MapLand({
  fills,
  interactive,
}: {
  fills: Record<string, string>;
  interactive: boolean;
}) {
  return (
    <g>
      <g aria-hidden="true">
        {SHAPES.map((shape) => (
          <path key={shape.id} d={shape.d} className="map-coast" />
        ))}
      </g>
      <g>
        {SHAPES.map((shape) => (
          <path
            key={shape.id}
            d={shape.d}
            data-id={shape.id}
            className="map-municipio"
            style={{ fill: fills[shape.id] }}
            aria-hidden={interactive ? undefined : "true"}
          />
        ))}
      </g>
    </g>
  );
});

/** Small islands, named just outside their real outline. Positions come from the geometry, never moved. */
const ISLAND_LABELS: {
  text: string;
  anchor: ReturnType<typeof islandLabelAnchor>;
  side: "above" | "below";
  align: "start" | "middle" | "end";
}[] = [
  // Mona sits at the western edge of the map: its name starts at the island and runs east, so it is never cut off.
  {
    text: "Isla de Mona",
    anchor: islandLabelAnchor(-67.89, 18.08, "below"),
    side: "below",
    align: "start",
  },
  {
    text: "Desecheo",
    anchor: islandLabelAnchor(-67.485, 18.385, "above"),
    side: "above",
    align: "middle",
  },
  {
    text: "Culebra",
    anchor: islandLabelAnchor(-65.29, 18.315, "above"),
    side: "above",
    align: "end",
  },
  {
    text: "Vieques",
    anchor: islandLabelAnchor(-65.44, 18.12, "below"),
    side: "below",
    align: "middle",
  },
];

const SEA_LABELS: { text: string; at: [number, number] }[] = [
  { text: "OCÉANO ATLÁNTICO", at: [-66.55, 18.6] },
  { text: "MAR CARIBE", at: [-66.25, 17.795] },
];

function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => {
      const rect = element.getBoundingClientRect();
      const width = Math.round(rect.width);
      const height = Math.round(rect.height);
      setSize((current) =>
        current.width === width && current.height === height ? current : { width, height },
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { ref, size };
}

function niceKm(pxPerKm: number): number {
  for (const km of [1, 2, 5, 10, 20, 50]) if (km * pxPerKm >= 48) return km;
  return 50;
}

type Props = {
  variant: MapVariant;
  label: string;
  fills: Record<string, string>;
  selectedId: string | null;
  /** Controlled view for band/detail. Null means "toda la isla". */
  view?: View | null;
  onViewChange?: (view: View, size: { width: number; height: number }) => void;
  /** Reports the drawn size, so a linked overview can show this map's visible area. */
  onResize?: (size: { width: number; height: number }) => void;
  onSelect?: (id: string) => void;
  /** Touch landed near several municipios: let the person choose. */
  onChoose?: (candidates: Candidate[]) => void;
  /** Overview only: the detail map's visible area, and a tap to move it. */
  viewport?: Bounds | null;
  onPick?: (point: [number, number]) => void;
  /** Accessible description of one municipio for the current metric. */
  describe?: (id: string) => string;
  tooltip?: (id: string) => ReactNode;
  /**
   * Municipio names. Zoomed in: every name that fits without colliding.
   * Zoomed out: only the selected and keyboard-focused names.
   */
  placeLabels?: boolean;
  /** View to use while `view` is null (for example, the phone starts on the main island). */
  initialView?: (width: number, height: number) => View;
  /** Centered note for metrics that only exist for the whole island. */
  islandNote?: string | null;
  className?: string;
  children?: ReactNode;
};

export function AtlasMap({
  variant,
  label,
  fills,
  selectedId,
  view = null,
  onViewChange,
  onResize,
  onSelect,
  onChoose,
  viewport = null,
  onPick,
  describe,
  tooltip,
  placeLabels = false,
  initialView,
  islandNote = null,
  className,
  children,
}: Props) {
  const { ref: boxRef, size } = useSize<HTMLDivElement>();
  const interactive = variant !== "overview";
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [hoverAt, setHoverAt] = useState<{ x: number; y: number } | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [hasFocus, setHasFocus] = useState(false);
  const drag = useRef<{ x: number; y: number; view: View; moved: boolean; pointer: string } | null>(
    null,
  );

  const ready = size.width > 20 && size.height > 20;
  useEffect(() => {
    if (ready) onResize?.(size);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, size.width, size.height]);
  const current = useMemo(() => {
    if (!ready) return null;
    if (variant === "overview") return fitView(size.width, size.height);
    if (!view)
      return initialView ? initialView(size.width, size.height) : fitView(size.width, size.height);
    return clampView(view, size.width, size.height);
  }, [ready, variant, view, initialView, size.width, size.height]);
  const box = current ? viewBox(current, size.width, size.height) : null;
  const k = current?.k ?? 1;
  const zoomed = current && ready ? current.k > fitView(size.width, size.height).k * 1.6 : false;

  function toWorld(clientX: number, clientY: number): [number, number] | null {
    const element = boxRef.current;
    if (!element || !box) return null;
    const rect = element.getBoundingClientRect();
    return [box.x0 + (clientX - rect.left) / k, box.y0 + (clientY - rect.top) / k];
  }

  function onPointerDown(event: PointerEvent<SVGSVGElement>) {
    if (!current) return;
    drag.current = {
      x: event.clientX,
      y: event.clientY,
      view: current,
      moved: false,
      pointer: event.pointerType,
    };
    if (variant !== "overview") event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function onPointerMove(event: PointerEvent<SVGSVGElement>) {
    const state = drag.current;
    if (state && variant !== "overview") {
      const dx = event.clientX - state.x;
      const dy = event.clientY - state.y;
      if (!state.moved && dx * dx + dy * dy > 36) state.moved = true;
      if (state.moved && onViewChange) {
        onViewChange(
          clampView(
            {
              ...state.view,
              cx: state.view.cx - dx / state.view.k,
              cy: state.view.cy - dy / state.view.k,
            },
            size.width,
            size.height,
          ),
          size,
        );
      }
      return;
    }
    if (event.pointerType !== "mouse" || !tooltip) return;
    const id = (event.target as Element).getAttribute?.("data-id");
    setHoverId(id);
    const element = boxRef.current;
    if (id && element) {
      const rect = element.getBoundingClientRect();
      setHoverAt({ x: event.clientX - rect.left, y: event.clientY - rect.top });
    }
  }

  function onPointerUp(event: PointerEvent<SVGSVGElement>) {
    const state = drag.current;
    drag.current = null;
    if (!state || state.moved) return;
    const point = toWorld(event.clientX, event.clientY);
    if (!point) return;
    if (variant === "overview") {
      onPick?.(point);
      return;
    }
    if (state.pointer === "mouse") {
      const hit = shapeAt(point[0], point[1]);
      if (hit) onSelect?.(hit.id);
      return;
    }
    // Touch or pen: 22 px of reach on screen, whatever the zoom.
    const result = resolveTap(point[0], point[1], 22 / k);
    if (result.kind === "select") onSelect?.(result.id);
    else if (result.kind === "choose") onChoose?.(result.candidates);
  }

  function onKeyDown(event: KeyboardEvent<SVGSVGElement>) {
    if (!interactive) return;
    const arrows: Record<string, Direction> = {
      ArrowLeft: "left",
      ArrowRight: "right",
      ArrowUp: "up",
      ArrowDown: "down",
    };
    const base = focusId ?? selectedId ?? "72127";
    if (arrows[event.key]) {
      event.preventDefault();
      setFocusId(neighborInDirection(base, arrows[event.key]) ?? base);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect?.(base);
    } else if ((event.key === "+" || event.key === "=") && current && onViewChange) {
      event.preventDefault();
      onViewChange(zoomView(current, 1.5, size.width, size.height), size);
    } else if ((event.key === "-" || event.key === "_") && current && onViewChange) {
      event.preventDefault();
      onViewChange(zoomView(current, 1 / 1.5, size.width, size.height), size);
    } else if (event.key === "0" && onViewChange) {
      event.preventDefault();
      onViewChange(fitView(size.width, size.height), size);
    }
  }

  const activeFocus = hasFocus ? (focusId ?? selectedId ?? "72127") : null;
  const selected = selectedId ? SHAPE_BY_ID.get(selectedId) : undefined;
  const hovered = hoverId && hoverId !== selectedId ? SHAPE_BY_ID.get(hoverId) : undefined;
  const focused = activeFocus ? SHAPE_BY_ID.get(activeFocus) : undefined;
  const px = (n: number) => n / k;

  const labels = useMemo(() => {
    if (!placeLabels || !box) return [];
    return layoutLabels(box, k, {
      selectedId,
      focusId: activeFocus,
      hoverId: zoomed ? hoverId : null,
      showAll: zoomed,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    placeLabels,
    zoomed,
    box?.x0,
    box?.y0,
    box?.x1,
    box?.y1,
    k,
    selectedId,
    activeFocus,
    hoverId,
  ]);

  const kmPx = unitsPerKm() * k;
  const km = niceKm(kmPx);

  return (
    <div
      ref={boxRef}
      className={`relative h-full w-full overflow-hidden bg-water ${className ?? ""}`}
    >
      {box && (
        <svg
          className={`map-svg h-full w-full ${variant !== "overview" ? "map-pan map-interactive" : ""}`}
          viewBox={`${box.x0} ${box.y0} ${box.x1 - box.x0} ${box.y1 - box.y0}`}
          preserveAspectRatio="xMidYMid meet"
          role={interactive ? "application" : "img"}
          aria-roledescription={interactive ? "mapa" : undefined}
          aria-label={label}
          tabIndex={interactive ? 0 : undefined}
          onKeyDown={onKeyDown}
          onFocus={() => setHasFocus(true)}
          onBlur={() => {
            setHasFocus(false);
            setFocusId(null);
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => {
            drag.current = null;
          }}
          onPointerLeave={() => setHoverId(null)}
        >
          <defs>
            <NoDataPattern />
          </defs>
          <rect
            x={WORLD.x0 - 2000}
            y={WORLD.y0 - 2000}
            width={5000}
            height={5000}
            className="fill-water"
          />
          <g aria-hidden="true">
            {SEA_LABELS.map((sea) => {
              const [x, y] = project(...sea.at);
              return (
                <text
                  key={sea.text}
                  x={x}
                  y={y}
                  textAnchor="middle"
                  className="map-sea-label"
                  fontSize={px(variant === "overview" ? 7 : 12)}
                  letterSpacing={px(variant === "overview" ? 1.5 : 4)}
                >
                  {sea.text}
                </text>
              );
            })}
          </g>
          <MapLand fills={fills} interactive={interactive} />
          <g aria-hidden="true">
            {ISLAND_LABELS.map((island) => {
              const size = variant === "overview" ? 9 : 12;
              const { x0, x1, x: center, y: edge } = island.anchor;
              const x = island.align === "start" ? x0 : island.align === "end" ? x1 : center;
              const y = island.side === "above" ? edge - px(5) : edge + px(size + 2);
              return (
                <text
                  key={island.text}
                  x={x}
                  y={y}
                  textAnchor={island.align}
                  className="map-sea-label"
                  fontSize={px(size)}
                >
                  {island.text}
                </text>
              );
            })}
          </g>
          {hovered && <path d={hovered.d} className="map-outline map-hover" />}
          {selected && (
            <>
              <path d={selected.d} className="map-outline map-selected-halo" />
              <path
                d={selected.d}
                className="map-outline map-selected"
                style={variant === "overview" ? { strokeWidth: 2 } : undefined}
              />
            </>
          )}
          {focused && (
            <>
              <path d={focused.d} className="map-outline map-focus-halo" />
              <path d={focused.d} className="map-outline map-focus" />
            </>
          )}
          {labels.length > 0 && (
            <g aria-hidden="true">
              {labels.map((placed) => (
                <text
                  key={placed.id}
                  x={placed.x}
                  y={placed.y}
                  textAnchor="middle"
                  className="map-place-label"
                  fontSize={px(placed.size)}
                  fontWeight={placed.bold ? 700 : 400}
                  strokeWidth={px(3)}
                >
                  {placed.name}
                </text>
              ))}
            </g>
          )}
          {viewport && (
            <rect
              x={viewport.x0}
              y={viewport.y0}
              width={viewport.x1 - viewport.x0}
              height={viewport.y1 - viewport.y0}
              fill="rgb(255 255 255 / 0.14)"
              stroke="var(--color-fg)"
              strokeWidth={1.6}
              strokeDasharray="5 3"
              vectorEffect="non-scaling-stroke"
              pointerEvents="none"
            />
          )}
        </svg>
      )}

      {islandNote && (
        <p className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-sm bg-fg px-3 py-2 text-center text-sm font-semibold text-surface">
          {islandNote}
        </p>
      )}

      {variant !== "overview" && box && (
        <div
          className="pointer-events-none absolute bottom-2 left-3 flex items-end gap-1.5 text-[11px] text-sea"
          aria-hidden="true"
        >
          <span className="block h-[3px] bg-sea" style={{ width: `${km * kmPx}px` }} />
          <span>{km} km</span>
        </div>
      )}

      {hovered && hoverAt && tooltip && (
        <div
          role="tooltip"
          className="pointer-events-none absolute z-20 max-w-60 rounded-[3px] border border-fg bg-surface px-3 py-2 shadow-float"
          style={{
            left: Math.min(hoverAt.x + 14, size.width - 230),
            top: hoverAt.y + 14 > size.height - 90 ? hoverAt.y - 90 : hoverAt.y + 14,
          }}
        >
          {tooltip(hovered.id)}
        </div>
      )}

      {interactive && describe && (
        <p className="sr-only" aria-live="polite">
          {activeFocus
            ? `${describe(activeFocus)}. Enter para seleccionar; flechas para moverte.`
            : ""}
        </p>
      )}
      {children}
    </div>
  );
}
