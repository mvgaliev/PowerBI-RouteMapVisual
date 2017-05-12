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