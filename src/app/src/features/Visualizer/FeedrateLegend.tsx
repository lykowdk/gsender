/*
 * Copyright (C) 2021 Sienci Labs Inc.
 *
 * This file is part of gSender.
 *
 * gSender is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, under version 3 of the License.
 *
 * gSender is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with gSender.  If not, see <https://www.gnu.org/licenses/>.
 *
 * Contact for information regarding this program and its license
 * can be sent through gSender@sienci.com or mailed to the main office
 * of Sienci Labs Inc. in Waterloo, Ontario, Canada.
 *
 */

import { useEffect, useState } from 'react';
import pubsub from 'pubsub-js';

import store from 'app/store';
import { Switch } from 'app/components/shadcn/Switch';

// Anything at or below this ratio (achieved / commanded) is full red. Must
// match HEATMAP_RATIO_FLOOR in GCodeVisualizer.js so the legend and the
// rendered toolpath colors stay aligned.
const RATIO_FLOOR = 0.25;
// Matches HEATMAP_ACTIVE_COLOR in GCodeVisualizer.js.
const ACTIVE_COLOR = '#ff1493';

interface AppliedState {
    enabled: boolean;
    hasGeometry: boolean;
}

// Map an achieved/commanded ratio to a percentage along the legend's
// gradient. The ramp clamps below RATIO_FLOOR (red) and above 1 (green), so
// the pointer pins to the corresponding edge in those cases.
const ratioToLegendPercent = (ratio: number): number => {
    const clamped = Math.max(RATIO_FLOOR, Math.min(ratio, 1));
    return ((clamped - RATIO_FLOOR) / (1 - RATIO_FLOOR)) * 100;
};

/**
 * Feedrate heat-map control + legend, overlaid on the 3D visualizer.
 *
 * - Switch toggles the per-vertex heat map on the toolpath: cutting moves are
 *   colored by the speed actually achieved (from the worker's GRBL-style
 *   planner pass) divided by the commanded F. Green = hit commanded speed,
 *   yellow ~= 50%, red = 25% or less. G0 rapids keep their motion color.
 * - When enabled, a horizontal gradient appears with a pointer that tracks
 *   the active line's achieved/commanded ratio while a job is running.
 *
 * Persists `widgets.visualizer.feedrateHeatmap` to the store and broadcasts
 * `visualizer:heatmap` so the 3D visualizer can swap its color buffer live.
 */
const FeedrateLegend = () => {
    const [enabled, setEnabled] = useState<boolean>(() =>
        Boolean(store.get('widgets.visualizer.feedrateHeatmap', false)),
    );
    const [applied, setApplied] = useState<AppliedState>({
        enabled: false,
        hasGeometry: false,
    });
    // null when no file is loaded or no job is running; otherwise the
    // achieved/commanded ratio of the line currently being executed.
    const [activeRatio, setActiveRatio] = useState<number | null>(null);

    useEffect(() => {
        const appliedToken = pubsub.subscribe(
            'visualizer:heatmap:applied',
            (_msg: string, payload: AppliedState) => {
                if (payload) {
                    setApplied(payload);
                }
            },
        );
        const ratioToken = pubsub.subscribe(
            'visualizer:heatmap:activeRatio',
            (_msg: string, payload: { ratio: number | null }) => {
                setActiveRatio(
                    payload && typeof payload.ratio === 'number'
                        ? payload.ratio
                        : null,
                );
            },
        );
        return () => {
            pubsub.unsubscribe(appliedToken);
            pubsub.unsubscribe(ratioToken);
        };
    }, []);

    const handleToggle = (checked: boolean) => {
        setEnabled(checked);
        store.set('widgets.visualizer.feedrateHeatmap', checked);
        pubsub.publish('visualizer:heatmap', { enabled: checked });
    };

    return (
        <div className="absolute right-4 bottom-4 portrait:bottom-32 z-20 flex w-48 flex-col gap-2 rounded bg-gray-900 bg-opacity-80 px-2 py-2 text-xs text-white shadow-lg">
            {enabled && (
                <div className="flex flex-col gap-1">
                    {applied.enabled && !applied.hasGeometry && (
                        <div className="text-[10px] italic opacity-75">
                            Load a g-code file.
                        </div>
                    )}
                    <div
                        className="h-2 w-full rounded"
                        style={{
                            // Four stops matching heatmapRGB in GCodeVisualizer:
                            // red (≤25%) → orange (50%) → yellow (75%) → green (100%).
                            background:
                                'linear-gradient(to right, #ff0000 0%, #ff8000 33.33%, #ffff00 66.67%, #00ff00 100%)',
                        }}
                    />
                    <div className="relative h-2 w-full">
                        {activeRatio !== null && (
                            <div
                                className="absolute top-0"
                                style={{
                                    left: `${ratioToLegendPercent(activeRatio)}%`,
                                    transform: 'translateX(-50%)',
                                    width: 0,
                                    height: 0,
                                    borderLeft: '4px solid transparent',
                                    borderRight: '4px solid transparent',
                                    borderBottom: `5px solid ${ACTIVE_COLOR}`,
                                }}
                                title={`Active move: ${Math.round(
                                    activeRatio * 100,
                                )}% of commanded F`}
                            />
                        )}
                    </div>
                    <div className="flex justify-between whitespace-nowrap text-[10px] leading-none">
                        <span>≤ 25%</span>
                        <span>50%</span>
                        <span>75%</span>
                        <span>100%</span>
                    </div>
                </div>
            )}
            <div className="flex items-center gap-2">
                <Switch
                    id="feedrate-heatmap-toggle"
                    checked={enabled}
                    onChange={handleToggle}
                />
                <span className="whitespace-nowrap font-semibold">
                    Heat map
                </span>
            </div>
        </div>
    );
};

export default FeedrateLegend;
