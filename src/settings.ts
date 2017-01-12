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
    import DataViewObjectsParser = powerbi.extensibility.utils.dataview.DataViewObjectsParser;
    
    export class CustomColor {
        public solid: { color: string }
        
        constructor(color: string) {
            this.solid = { color: color };
        }
    }

    export class RouteMapRoutesSettings {
        public arcColor: CustomColor = new CustomColor("red");       
        
        public getArcColor() {
            return this.arcColor.solid.color;
        }               
    }
    
    export class RouteMapMarkersSettings {
        public labelFontColor: CustomColor = new CustomColor("black");
        public markerColor: CustomColor = new CustomColor("blue");
        public radius: number = 6;
        
        public getLabelFontColor() {
            return this.labelFontColor.solid.color;
        }
        
        public getMarkerColor() {
            return this.markerColor.solid.color;
        }
    }
    
    export class RouteMapStateSettings {
        public stateColor: CustomColor;
        public dataMin: number;
        public dataMax: number;
        
        public getStateColor() {
            return this.stateColor.solid.color;
        }
        
        public constructor(dataMin: number, dataMax: number, color: string) {
            this.dataMax = dataMax;
            this.dataMin = dataMin;
            this.stateColor = new CustomColor(color);
        }
    }

    export class RouteMapSettings extends DataViewObjectsParser {
        public routes: RouteMapRoutesSettings = new RouteMapRoutesSettings();
        public markers: RouteMapMarkersSettings = new RouteMapMarkersSettings();
        public state1: RouteMapStateSettings = new RouteMapStateSettings(-Infinity, 0, "red");
        public state2: RouteMapStateSettings = new RouteMapStateSettings(0, 1, "yellow");
        public state3: RouteMapStateSettings = new RouteMapStateSettings(1, Infinity, "green");
    }
}