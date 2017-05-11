/*
 *  Power BI Visualizations
 *
 *  Copyright (c) Microsoft Corporation
 *  All rights reserved.
 *  MIT License
 *
 *  Permission is hereby granted, free of charge, to any person obtaining a copy
 *  of this software and associated documentation files (the ""Software""), to deal
 *  in the Software without restriction, including without limitation the rights
 *  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 *  copies of the Software, and to permit persons to whom the Software is
 *  furnished to do so, subject to the following conditions:
 *
 *  The above copyright notice and this permission notice shall be included in
 *  all copies or substantial portions of the Software.
 *
 *  THE SOFTWARE IS PROVIDED *AS IS*, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 *  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 *  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 *  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 *  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 *  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 *  THE SOFTWARE.
 */

module powerbi.extensibility.visual {
    
    import TooltipEnabledDataPoint = powerbi.extensibility.utils.tooltip.TooltipEnabledDataPoint;
    
    export interface RouteMapDataView {
        markers: RouteMapMarkerList,
        arcs: RouteMapArcList,
        arcsLayer: L.FeatureGroup,
        markersLayer: L.FeatureGroup
    }
    
    export interface RouteMapMarkerList {
        [key: string]: RouteMapMarker;
    }
    
    export interface RouteMapArcList {
        [key: string]: RouteMapArc;
    }
    
    export interface RouteMapMarker {
        marker: L.CircleMarker, 
        location: string,
        arcs: RouteMapArc[],
        isSelected: boolean
    }
    
    export interface FromToLatLng {
        toLatLng: L.LatLng,
        fromLatLng: L.LatLng,
        isFromLngMinus360: boolean,
        isToLngMinus360: boolean
    }
    
    export interface RouteMapArc extends TooltipEnabledDataPoint {
        arc: L.Polyline, 
        markers: RouteMapMarker[],
        isSelected: boolean,
        selectionId: ISelectionId
    }
    
    export interface RouteMapPoint {
        name: string,
        latitude: number,
        longitude: number
    }
    
    export interface ThicknessOptions {
        minValue: number,
        coeficient: number
    } 
    
    export interface Direction {
        market: string,
        index: number,
        locationFrom: string,
        locationTo: string,
        fromToLatLng: FromToLatLng,
        stateValue: number,
        stateValueMin1: number,
        stateValueMax1: number,
        stateValueMin2: number,
        stateValueMax2: number,
        stateValueMin3: number,
        stateValueMax3: number,
        thicknessValue: number,
        thicknessMin: number,
        thicknessMax: number,
        tooltipInfo: VisualTooltipDataItem[]  
    }
}

declare namespace L {
    export class Util {
        public static setOptions(target:any, options:any):void;

        public static throttle(fn: Function, time: Number, context?: Object);
    }

    export class LineUtil {
        public static _sqClosestPointOnSegment: any;

        public static _flat(latlngs: any): any;

        public static clipSegment(a, b, bounds, useLastCode, round);

        public static simplify(points, tolerance);

        public static pointToSegmentDistance(p, p1, p2);
    }
    
    export function toLatLng(a, b?, c?);

    export class LatLng {}

    export class LatLngBounds { }

    export class Bounds {
        public min: Point;

        public max: Point;

        public isValid(): boolean;
    }

    export class Point {
        public x: number;

        public y: number;

        constructor();

        constructor(a: any, b: any);

        public _subtract(p: Point);

        public _add(p: Point);
    }    
}