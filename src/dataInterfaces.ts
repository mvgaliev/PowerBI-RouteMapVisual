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

    export interface RouteMapMarker extends TooltipEnabledDataPoint {        
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

    let PointyLine = (L as any).FeatureGroup.extend({
            options: {
                arrowWidthCoef: 5,
                arrowLengthPart: 0.4,
                arrowMaxLength: 60
            },

            initialize(from, to, options) {
                this._checkOptions();
                L.Util.setOptions(this, options);
                this._setData(from, to);
            },

            onAdd: function (map) {
                this._map = map;
                this._renderer = map.getRenderer(this);
                this._redraw();                
                
                map.on('viewreset', this._reset, this);
                map.on('zoomstart', this._deleteMarker, this);
                map.on('zoomend', this._updateMarker, this);
                map.on('moveend', this._updateMarker, this);
            },

            onRemove: function () {
                this._deleteLayers();

                this._map.off('viewreset', this._reset, this);
                this._map.off('zoomstart', this._deleteMarker, this);
                this._map.off('zoomend', this._updateMarker, this);
                this._map.off('moveend', this._updateMarker, this);
            },

            setStyle(style) {
                L.Util.setOptions(this, style);
                this._polyline.setStyle.call(this._polyline, style);
                this._updateMarker();
            },

            _checkOptions() {
                let lengthPart = this.options.arrowLengthPart;
                this.options.arrowLengthPart = Math.max(0, Math.min(1, lengthPart));
            },

            _setData: function (from, to) {
                this._from = from;
                this._to = to;            
            },

            _reset() {
                this._redraw();
            },

            _redraw() {
                if (!this._map) {
                    return;
                }
                
                this._deleteLayers();
                this._layers = {};

                this._drawLine();
                this._drawMarker();                
            },

            _createPolyline(from: L.LatLng, to: L.LatLng): L.Polyline {
                return L.polyline([from, to], this.options);                
            },

            _createMarker(fromLine: L.Polyline): any {
                const lineWidth = this.options.weight;
                const arrowWidthCoef = this.options.arrowWidthCoef;
                const arrowLengthPart = this.options.arrowLengthPart;
                const arrowMaxLength = this.options.arrowMaxLength;
                const color = this.options.color;

                let lineLength = this._calculateLineLength(fromLine);
                let width = lineWidth * arrowWidthCoef;
                let height = Math.min(lineLength * arrowLengthPart, arrowMaxLength);
                
                let icon = L.divIcon({
                    html: `<div style='width: 0;height: 0;border-left: ${width/2}px solid transparent;border-right: ${width/2}px solid transparent;border-bottom: ${height}px solid ${color};'></div>`,
                    iconSize: [width, height],
                    iconAnchor: [width/2, height],
                    popupAnchor: [-3, -76],
                    className: ''
                });

                let marker = L.marker(fromLine.getLatLngs()[0], {
                    icon: icon,
                    pane: this.options.pane,
                    opacity: this.options.opacity
                });                

                return marker;
            },

            _drawLine() {
                let line = this._createPolyline(this._from, this._to);
                this._polyline = line;
                this.addLayer(line);
            },

            _drawMarker() {
                if (!this._polyline)
                    return;

                let markerPoint = this._map.latLngToLayerPoint(this._polyline.getLatLngs()[0]);
                let markerInView = this._renderer._bounds.intersects(L.bounds(markerPoint, markerPoint));

                if (!markerInView)
                    return;

                let marker = this._createMarker(this._polyline);
                this._sourceMarker = marker;
                this.addLayer(marker);
                this._alignMarkerWithLine(marker, this._polyline);
            },

            _deleteLayers() {
                for (var i in this._layers) {
                    if (this._layers.hasOwnProperty(i)) {
                        this._map.removeLayer(this._layers[i]);
                    }
                }

                if (typeof this._sourceMarker !== 'undefined') {
                    this._map.removeLayer(this._sourceMarker);
                }
            },

            _deleteMarker() {
                if (!this._sourceMarker)
                    return;

                this._map.removeLayer(this._sourceMarker);
                this._sourceMarker = undefined;
            },

            _updateMarker() {
                this._deleteMarker();
                this._drawMarker();
            },

            _calculateLineLength(line: L.Polyline) {
                let linePxBounds: L.Bounds = (<any>line)._pxBounds;

                let dx = linePxBounds.max.x - linePxBounds.min.x;
                let dy = linePxBounds.max.y - linePxBounds.min.y;

                return Math.sqrt(dx*dx + dy*dy);
            },

            _getUnitVector(line: L.Polyline, length?: number) {
                let startPoint: L.Point = this._map.latLngToLayerPoint(line.getLatLngs()[0]);
                let endPoint: L.Point = this._map.latLngToLayerPoint(line.getLatLngs()[1]);
                
                if (!length) {
                    length = this._calculateLineLength(line);
                }
                
                return [
                    (endPoint.x - startPoint.x) * 1.0 / length,
                    (endPoint.y - startPoint.y) * 1.0 / length
                ];
            },

            _alignMarkerWithLine(marker: any, line: L.Polyline) {
                const r2d = 180/Math.PI;
                let unitVector = this._getUnitVector(line);
                marker._icon.style[(<any>L.DomUtil).TRANSFORM + 'Origin'] = "center bottom";

                let tan = 
                    (Math.abs(unitVector[0]) > 0.00001 
                        ? unitVector[1] / unitVector[0] 
                        : unitVector[1] > 0
                            ? Number.POSITIVE_INFINITY
                            : Number.NEGATIVE_INFINITY);

                let degrees = Math.atan(tan) * r2d + 90;

                if ((tan > 0 && unitVector[1] < 0) || (tan < 0 && unitVector[0] < 0))
                    degrees += 180;

                let oldIE = ((<any>L.DomUtil).TRANSFORM === 'msTransform');
                if(oldIE) {
                   marker._icon.style[(<any>L.DomUtil).TRANSFORM] = 'rotate(' + degrees + 'deg)';
                } else {
                   marker._icon.style[(<any>L.DomUtil).TRANSFORM] += ' rotateZ(' + degrees + 'deg)';
                }
            }            
        });

        export function pointyLine(from: L.LatLng, to: L.LatLng, options: any) {
            return new PointyLine(from, to, options);
        }
}
