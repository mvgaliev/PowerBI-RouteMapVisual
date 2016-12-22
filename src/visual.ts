/*
 *  Power BI Visual CLI
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
    import DataViewObjects = powerbi.DataViewObjects;
    import DataViewValueColumn = powerbi.DataViewValueColumn;

    export class Visual implements IVisual {

        private connectionMapDataView: ConnectionMapDataView;
        private targetHtmlElement: HTMLElement;
        private hostContainer: JQuery;
        private map: any;
        private dataIsNotEmpty: boolean;
        private isDataValid: boolean = false;
        private selectionManager: ISelectionManager;
        private host: IVisualHost;

        private settings: ConnectionMapSettings;

        constructor(options: VisualConstructorOptions) {
            this.init(options);
        }

        public init(options: VisualConstructorOptions): void {
            this.selectionManager = options.host.createSelectionManager();
            this.host = options.host;

            this.targetHtmlElement = options.element;

            this.addMapDivToDocument();

            this.hostContainer = $(this.targetHtmlElement).css('overflow-x', 'hidden');
            this.initMap();
        }

        public enumerateObjectInstances(options: EnumerateVisualObjectInstancesOptions): VisualObjectInstanceEnumeration {
            let objectName = options.objectName;
            let objectEnumeration: VisualObjectInstance[] = [];

            switch (objectName) {
                case 'routes':
                    objectEnumeration.push({
                        objectName: objectName,
                        displayName: "Routes",
                        properties: {
                            arcColor: this.settings.routes.getColor(),
                            showOutOfMapMarkerLabels: this.settings.routes.showOutOfMapMarkerLabels
                        },
                        selector: null
                    });
                    break;
            };

            return objectEnumeration;
        }
        
        private mapGotActiveSelections(): boolean {
            return this.selectionManager.hasSelection();
        }

        private addMapDivToDocument(): void {
            var div = document.createElement('div');
            div.setAttribute("id", "map");
            div.setAttribute("style", "height:550px");
            div.setAttribute("class", "none");

            this.targetHtmlElement.appendChild(div);
        }

        public initMap(): void {
            //this.map = L.map('map').setView([51.4707017, -0.4608747], 14);  

            /*var Esri_WorldStreetMap = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
                attribution: 'Tiles &copy; Esri &mdash; Source: Esri, DeLorme, NAVTEQ, USGS, Intermap, iPC, NRCAN, Esri Japan, METI, Esri China (Hong Kong), Esri (Thailand), TomTom, 2012'
            });
            
            this.map.addLayer(Esri_WorldStreetMap);*/

            this.map = L.map('map').setView([33.9415839, -118.4435494], 3);

            //add map tile
            var layer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                maxZoom: 18
            }).addTo(this.map);

            this.connectionMapDataView = {
                markers: {},
                arcs: {},
                arcsLayer: L.featureGroup(),
                markersLayer: L.featureGroup(),
                labelsLayer: L.featureGroup()
            };

            this.setMapHandlers();
        }

        public update(options: VisualUpdateOptions): void {
            // render new data if dataset was changed
            if (options.type == VisualUpdateType.Data) {
                let dataView: DataView = options
                    && options.dataViews
                    && options.dataViews[0];

                this.clearMap();
                this.connectionMapDataView = this.converter(dataView);
                this.render();
            }

            this.map.invalidateSize();
            this.updateContainerViewports(options.viewport);
        }

        private parseSettings(dataView: DataView): ConnectionMapSettings {
            return ConnectionMapSettings.parse<ConnectionMapSettings>(dataView);
        }

        // returns:
        // 0 - marker isn't on the line
        // 1 - marker is in the end of the line
        // -1 - marker is at the beginning of the line
        private isMarkerOnTheLine(coords: L.LatLng[], markerPoint: L.LatLng): number {
            if (!coords || coords.length === 0)
                return 0;

            if (coords[0].lat.toFixed(5) === markerPoint.lat.toFixed(5) &&
                (coords[0].lng.toFixed(5) === markerPoint.lng.toFixed(5) || ((Math.abs(+coords[0].lng.toFixed(5)) + Math.abs(+markerPoint.lng.toFixed(5)) - 360) < 2)))
                return -1;
            else if (coords[coords.length - 1].lat.toFixed(5) === markerPoint.lat.toFixed(5) &&
                (coords[coords.length - 1].lng.toFixed(5) === markerPoint.lng.toFixed(5) || ((Math.abs(+coords[coords.length - 1].lat.toFixed(5)) + Math.abs(+markerPoint.lat.toFixed(5)) - 360) < 2)))
                return 1;
            else return 0;
        };

        private isCoordVisible(latLng: L.LatLng): boolean {
            let bounds = this.map.getBounds();

            return latLng && latLng.lat < bounds.getNorth() &&
                latLng.lat > bounds.getSouth() &&
                latLng.lng > bounds.getWest() &&
                latLng.lng < bounds.getEast();
        }

        private shiftPointToShowLabelCorrectly(nearestVisiblePoint: L.LatLng): L.LatLng {
            let pixelMaxOffset = 20,
                mapBorders = this.map.getPixelBounds(),
                point = this.map.project(nearestVisiblePoint);

            let offsetX = 0,
                offsetY = 0;

            if (Math.abs(point.y - mapBorders.min.y) < pixelMaxOffset) {
                // point is on the top edge
                offsetY = 10;
            }

            if (Math.abs(point.x - mapBorders.max.x) < pixelMaxOffset) {
                // point is on the right edge
                offsetX = -50;
            }

            if (Math.abs(point.x - mapBorders.min.x) < pixelMaxOffset) {
                // point is on the left edge
                offsetX = 10;
            }
            if (Math.abs(point.y - mapBorders.max.y) < pixelMaxOffset) {
                // point is on the bottom edge
                offsetY = -20;
            }

            point.x = point.x + offsetX;
            point.y = point.y + offsetY;
            return this.map.unproject(point);
        }

        private createMarkerDirectionLabels(marker: L.CircleMarker, arcs: ConnectionMapArc[], title: string): L.Marker[] {
            let markerPoint = marker.getLatLng(),
                isMarkerInvisible = !this.isCoordVisible(markerPoint),
                nearestVisiblePoints: L.LatLng[] = [],
                labelLayer: L.FeatureGroup = L.featureGroup();

            if (isMarkerInvisible) {

                for (var item in arcs) {
                    let connectionMapArc = arcs[item],
                        coords = connectionMapArc.arc.getLatLngs();

                    var isMarkerOnThePolyline = this.isMarkerOnTheLine(coords, markerPoint);
                    if (isMarkerOnThePolyline === 0)
                        continue;

                    if (isMarkerOnThePolyline === -1) {
                        for (var index in coords) {
                            if (this.isCoordVisible(coords[index])) {
                                nearestVisiblePoints.push(coords[index]);
                                break;
                            }
                        }
                    } else if (isMarkerOnThePolyline === 1) {
                        for (var j = coords.length - 1; j >= 0; j--) {
                            if (this.isCoordVisible(coords[j])) {
                                nearestVisiblePoints.push(coords[j]);
                                break;
                            }
                        }
                    }
                }
            }

            let labels: L.Marker[] = [];
            for (var i = 0; i < nearestVisiblePoints.length; i++) {
                let nearestVisiblePoint = this.shiftPointToShowLabelCorrectly(nearestVisiblePoints[i]);
                let label = L.divIcon({ className: 'connection-map-direction-label', html: title });
                labels.push(L.marker(nearestVisiblePoint, { icon: label }));
            }

            return labels;
        }

        private createMarkersDirectionLabels(markerList: ConnectionMapMarkerList): L.Marker[] {
            let outOfBorderLabels: L.Marker[] = [];

            for (var item in markerList) {
                let markerWithArcs = markerList[item];

                let newLabels = this.createMarkerDirectionLabels(markerWithArcs.marker, markerWithArcs.arcs, markerWithArcs.airportCode);

                newLabels.forEach((item) => {
                    outOfBorderLabels.push(item);
                });
            }

            return outOfBorderLabels;
        }

        private addMarkersToLayer(markers: L.Marker[], layer: L.FeatureGroup): void {
            markers.forEach((item) => {
                layer.addLayer(item);
            });
        }

        public updateContainerViewports(viewport: IViewport) {
            // handle resize            
            var width = viewport.width;
            var height = viewport.height;
            this.hostContainer.css({
                'height': height,
                'width': width
            });
            // resize map     
            document.getElementById('map').style.width = viewport.width.toString() + "px";
            document.getElementById('map').style.height = viewport.height.toString() + "px";
        }

        private setPopupToElement(content: string, element: any): void {
            element.bindPopup(content);

            let map = this.map;
            element.on("mouseover", function (e) {
                map.dragging.disable();
                this.openPopup();
            });
            element.on('mouseout', function (e) {
                map.dragging.enable();
                this.closePopup();
            });
        }

        private setLabelToElement(content: string, element: any): void {
            element.bindTooltip(content, { permanent: true });
        }

        private setSelectionStyle(selected: boolean, element: L.Path): void {
            let opacity: number = selected ? 1 : 0.3;

            element.setStyle({
                opacity: opacity
            });
        }

        private unselectAll(): void {
            let markers = this.connectionMapDataView.markers;
            let arcs = this.connectionMapDataView.arcs;

            for (var item in arcs) {
                arcs[item].isSelected = false;
                this.setSelectionStyle(true, arcs[item].arc);
            }

            for (var item in markers) {
                markers[item].isSelected = false;
                this.setSelectionStyle(true, markers[item].marker);
            }
        }

        private setOnMarkerClickEvent(element: L.CircleMarker): void {
            let me = this;

            element.on('click', function (e) {

                let markers = me.connectionMapDataView.markers;
                let arcs = me.connectionMapDataView.arcs;
                
                let arcSelectionIds: ISelectionId[] = [];
                
                let connectionMapMarker: ConnectionMapMarker;
                
                for(var item in markers) {
                    if(markers[item].marker === this) {
                        connectionMapMarker = markers[item];
                        break;
                    }
                } 
                
                connectionMapMarker.arcs.map((value) => {
                    arcSelectionIds.push(value.selectionId);
                });

                let isMultipleSelection = (e as L.MouseEvent).originalEvent.ctrlKey;
                
                me.selectionManager.select(arcSelectionIds, isMultipleSelection).then((ids: ISelectionId[]) => {                    
                    
                    if (!isMultipleSelection) {
                        for (var item in arcs) {
                            arcs[item].isSelected = false;
                            me.setSelectionStyle(false, arcs[item].arc);
                        }

                        for (var item in markers) {
                            if (markers[item].marker !== this) {
                                markers[item].isSelected = false;
                                me.setSelectionStyle(false, markers[item].marker);
                            }
                        }                        
                    }  
                    
                    connectionMapMarker.isSelected = true;
                    me.setSelectionStyle(true, connectionMapMarker.marker);
                    
                    connectionMapMarker.arcs.forEach((item) => {
                        if(!item.isSelected) {
                            item.isSelected = true;
                            me.setSelectionStyle(true, item.arc);
                        }                                              
                    });
                });                        
            });
        }

        private setOnArcClickEvent(element: L.Polyline) {
            let me = this;

            element.on('click', function (e) {
                
                let markers = me.connectionMapDataView.markers;
                let arcs = me.connectionMapDataView.arcs;
                
                let connectionMapArc: ConnectionMapArc;
                
                for(var item in arcs) {
                    if(arcs[item].arc === this) {
                        connectionMapArc = arcs[item];
                        break;
                    }
                }                
                
                if(!connectionMapArc || connectionMapArc.isSelected) {
                    return;
                }
                
                let selectedId: ISelectionId = connectionMapArc.selectionId;
                
                let isMultipleSelection = (e as L.MouseEvent).originalEvent.ctrlKey;
                
                me.selectionManager.select(selectedId, isMultipleSelection).then((ids: ISelectionId[]) => {
                    
                    if(!isMultipleSelection) {
                        for (var item in markers) {
                            markers[item].isSelected = false;
                            me.setSelectionStyle(false, markers[item].marker);
                        }
                        
                        for (var item in arcs) {
                            if (arcs[item].arc !== this) {
                                arcs[item].isSelected = false;
                                me.setSelectionStyle(false, arcs[item].arc);
                            }
                        }
                    }       
                    
                    connectionMapArc.isSelected = true;
                    me.setSelectionStyle(true, connectionMapArc.arc);

                    connectionMapArc.markers.forEach((item: ConnectionMapMarker) => {                        
                        if(!item.isSelected) {
                            item.isSelected = true;
                            me.setSelectionStyle(true, item.marker);
                        }
                    });       
                });
            });
        }

        private createCustomizableArc(fromLatLng: L.LatLng, toLatLng: L.LatLng, settings: ConnectionMapSettings): L.Polyline {

            let l: any = L;

            let arc = l.Polyline.Arc(fromLatLng, toLatLng, {
                color: settings.routes.getColor(),
                vertices: 250
            });

            return arc;
        }

        private createCustomizableMarker(latLng: L.LatLng, settings: ConnectionMapSettings): L.CircleMarker {

            let marker = L.circleMarker(latLng, {
                color: "blue",
                fillColor: "blue",
                radius: 7
            });

            return marker;
        }

        public render(): void {
            this.map.addLayer(this.connectionMapDataView.arcsLayer);
            this.map.addLayer(this.connectionMapDataView.markersLayer);
            this.map.addLayer(this.connectionMapDataView.labelsLayer);
        }

        public clearMap(): void {
            let dataView = this.connectionMapDataView;
            if (dataView && dataView.arcsLayer && dataView.markersLayer && dataView.labelsLayer) {
                dataView.arcsLayer.clearLayers();
                dataView.markersLayer.clearLayers();
                dataView.labelsLayer.clearLayers();
            }
        }

        public converter(dataView: DataView): ConnectionMapDataView {

            this.isDataValid = false;
            let settings = this.settings = this.parseSettings(dataView);

            if (!dataView
                || !dataView.categorical
                || !dataView.categorical.categories
                || !dataView.categorical.categories[0]
                || !dataView.categorical.categories[1]
                || !dataView.categorical.categories[2]
                || !dataView.categorical.categories[0].values
                || !dataView.categorical.categories[1].values
                || !dataView.categorical.categories[2].values
                || !dataView.categorical.values
                || !dataView.categorical.values[0]
                || !dataView.categorical.values[1]
                || !dataView.categorical.values[2]
                || !dataView.categorical.values[3]) {

                return {
                    arcs: {},
                    arcsLayer: L.featureGroup(),
                    markers: {},
                    markersLayer: L.featureGroup(),
                    labelsLayer: L.featureGroup()
                };
            }

            debugger;

            let directions: Direction[] = [];

            let marketCategory = dataView.categorical.categories[0];
            let codesFrom: any[] = dataView.categorical.categories[1].values,
                codesTo: any[] = dataView.categorical.categories[2].values,
                markets: any = dataView.categorical.categories[0].values;

            let latsFrom: any[] = dataView.categorical.values[0].values,
                latsTo: any[] = dataView.categorical.values[2].values,
                longsFrom: any[] = dataView.categorical.values[1].values,
                longsTo: any[] = dataView.categorical.values[3].values;

            markets.forEach((item: any, index: number) => {
                directions.push({
                    market: markets[index],
                    index: index,
                    airportCodeFrom: codesFrom[index],
                    airportCodeTo: codesTo[index],
                    latitudeFrom: latsFrom[index],
                    longitudeFrom: longsFrom[index],
                    latitudeTo: latsTo[index],
                    longitudeTo: longsTo[index]
                });
            });

            let processedArcs: ConnectionMapArcList = {},
                processedMarkers: ConnectionMapMarkerList = {};

            let markersLayer: L.FeatureGroup = L.featureGroup(),
                arcsLayer: L.FeatureGroup = L.featureGroup(),
                labelsLayer: L.FeatureGroup = L.featureGroup();

            for (var item in directions) {
                let direction = directions[item];

                let fromLatLng = L.latLng(direction.latitudeFrom, direction.longitudeFrom),
                    toLatLng = L.latLng(direction.latitudeTo, direction.longitudeTo);

                let keyArc = direction.market,
                    keyFrom = direction.airportCodeFrom,
                    keyTo = direction.airportCodeTo;

                let airportCodeFrom = direction.airportCodeFrom,
                    airportCodeTo = direction.airportCodeTo;

                let arc = this.createCustomizableArc(fromLatLng, toLatLng, settings);                

                let popupMessage = "Market: " + direction.market;
                this.setPopupToElement(popupMessage, arc);
                this.setOnArcClickEvent(arc);

                let selectionId = this.host.createSelectionIdBuilder()
                    .withCategory(marketCategory, direction.index)
                    .createSelectionId();
                    
                    this.selectionManager.getSelectionIds()
                    
                let connectionMapArc = {
                    arc: arc,
                    markers: [],
                    isSelected: false,
                    selectionId: selectionId
                };    

                processedArcs[keyArc] = connectionMapArc;

                arcsLayer.addLayer(arc);

                let connectionMapMarkerFrom: ConnectionMapMarker,
                    connectionMapMarkerTo: ConnectionMapMarker;

                if (!processedMarkers[keyFrom]) {
                    let markerFrom = this.createCustomizableMarker(fromLatLng, settings);

                    let label = airportCodeFrom;
                    this.setLabelToElement(label, markerFrom);

                    let popupMessage = "Lat: " + direction.latitudeFrom + "<br>Long: " + direction.longitudeFrom;
                    this.setPopupToElement(popupMessage, markerFrom);
                    this.setOnMarkerClickEvent(markerFrom);
                    
                    connectionMapMarkerFrom = {
                        marker: markerFrom,
                        arcs: [], airportCode: direction.airportCodeFrom,
                        isSelected: false
                    };

                    processedMarkers[keyFrom] = connectionMapMarkerFrom;

                    markersLayer.addLayer(markerFrom);
                } else {
                    connectionMapMarkerFrom = processedMarkers[keyFrom];
                }

                if (!processedMarkers[keyTo]) {
                    let markerTo = this.createCustomizableMarker(toLatLng, settings);

                    let label = airportCodeTo;
                    this.setLabelToElement(label, markerTo);

                    let popupMessage = "Lat: " + direction.latitudeTo + "<br>Long: " + direction.longitudeTo;
                    this.setPopupToElement(popupMessage, markerTo);
                    this.setOnMarkerClickEvent(markerTo);
                    
                    connectionMapMarkerTo = {
                        marker: markerTo,
                        arcs: [],
                        airportCode: direction.airportCodeTo,
                        isSelected: false
                    };
                    
                    processedMarkers[keyTo] = connectionMapMarkerTo;

                    markersLayer.addLayer(markerTo);
                } else {
                    connectionMapMarkerTo = processedMarkers[keyTo];
                }

                processedMarkers[keyFrom].arcs.push(connectionMapArc);
                processedMarkers[keyTo].arcs.push(connectionMapArc);
                processedArcs[keyArc].markers.push(connectionMapMarkerFrom);
                processedArcs[keyArc].markers.push(connectionMapMarkerTo);
            }

            if (this.settings.routes.showOutOfMapMarkerLabels) {
                let outOfBorderLabels: L.Marker[] = this.createMarkersDirectionLabels(processedMarkers);
                this.addMarkersToLayer(outOfBorderLabels, labelsLayer);
            }

            this.isDataValid = true;

            return {
                arcs: processedArcs,
                markers: processedMarkers,
                markersLayer: markersLayer,
                arcsLayer: arcsLayer,
                labelsLayer: labelsLayer
            };
        }

        private handleMove(): void {
            if (!this.isDataValid) {
                return;
            }

            let markers = this.connectionMapDataView.markers;
            let labelsLayer = this.connectionMapDataView.labelsLayer;

            labelsLayer.clearLayers();

            let showLayers = this.settings.routes.showOutOfMapMarkerLabels;
            if (showLayers) {
                let outOfBorderLabels: L.Marker[] = this.createMarkersDirectionLabels(markers);
                this.addMarkersToLayer(outOfBorderLabels, labelsLayer);
            }
        }

        private setMapHandlers(): void {
            debugger;
            let me = this;

            this.map.on('zoom', function (e) {
                me.handleMove();
            });

            this.map.on('moveend', function (e) {
                me.handleMove();
            });

            this.map.on('click', function (e) {
                if (me.mapGotActiveSelections()) {
                    me.selectionManager.clear().then(() => {
                        me.unselectAll();
                    });
                }
            });
        }
    }
}