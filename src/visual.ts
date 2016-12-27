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
                        attribution: 'Map data &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors, <a href="http://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>',
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
        
        private midpointTo(pointFrom: L.LatLng, pointTo: L.LatLng): L.LatLng {

            var a1 = pointFrom.lat * Math.PI / 180, b1 = pointFrom.lng * Math.PI / 180;
            var a2 = pointTo.lat * Math.PI / 180, b2 = pointTo.lng * Math.PI / 180;

            if (Math.abs(b2-b1) > Math.PI) b1 += 2*Math.PI; // crossing anti-meridian

            var a3 = (a1+a2)/2;
            var f1 = Math.tan(Math.PI/4 + a1/2);
            var f2 = Math.tan(Math.PI/4 + a2/2);
            var f3 = Math.tan(Math.PI/4 + a3/2);
            var b3 = ((b2-b1)*Math.log(f3) + b1*Math.log(f2) - b2*Math.log(f1) ) / Math.log(f2/f1);

            if (!isFinite(b3)) b3 = (b1+b2)/2; // parallel of latitude

            var p = L.latLng((a3 * 180 / Math.PI), (b3 * 180 / Math.PI + 540) % 360 - 180); // normalise to −180..+180°

            return L.latLng((pointFrom.lat + pointTo.lat) / 2, (pointFrom.lng + pointTo.lng) / 2);
        };
        
        private getRoot(angleCoeficient: number, radianLatitude: number, distance: number): number[] {
            
            // ax^2 + bx + constant = distance    (distance = distance * distance * angleCoeficient * angleCoeficient from the formula) 
            let constant = (angleCoeficient * angleCoeficient + 1) * radianLatitude * radianLatitude;         
            var c = constant - (distance * distance * angleCoeficient * angleCoeficient);
            let a = angleCoeficient * angleCoeficient + 1;
            let b = -2 * radianLatitude * (angleCoeficient * angleCoeficient + 1);
	
            var d = b * b - 4 * a * c;
            
            var x1 = -b / ( 2 * a ) - Math.sqrt( d ) / ( 2 * a );
            var x2 = -b / ( 2 * a ) + Math.sqrt( d ) / ( 2 * a );
            
            let rootArray = [];
            rootArray.push(x1);
            rootArray.push(x2);
            
            return rootArray;
        }
        
        private createCurvedLine(pointFrom: L.LatLng, pointTo: L.LatLng, market: string, settings: ConnectionMapSettings, distanceCoef?: number): L.Polyline {
            let l: any = L;
            
            let midpoint = this.midpointTo(pointFrom, pointTo);
            
            let ang1 = (pointTo.lng - pointFrom.lng) / (pointTo.lat - pointFrom.lat);
            let ang2 = -(pointTo.lat - pointFrom.lat) / (pointTo.lng - pointFrom.lng);
            
            let plat = midpoint.lat * Math.PI / 180;
            let plng = midpoint.lng * Math.PI / 180;
            
            //let deltaLat = pointTo.lat * Math.PI / 180 - plat;
            //let deltaLng = pointTo.lng * Math.PI / 180 - plng;
            
            let deltaLat = pointTo.lat - midpoint.lat;
            let deltaLng = pointTo.lng - midpoint.lng;
            
            let distance = Math.sqrt(deltaLat * deltaLat + deltaLng * deltaLng)* Math.PI / 180;
            
            distance = distanceCoef ? distance * distanceCoef : distance;
            
            distance = distance > 0.5 ? distance / 2 : distance;
            
            console.log("market: " + market + "distance: " + distance);
            //distance = 1 + 1 / distance;

            let latitudes = this.getRoot(ang1, plat, distance);
            let lat = pointFrom.lat > 0 && pointTo.lat > 0 ? latitudes[1] : latitudes[0];
            let long1 = ((ang2 * (lat - plat) + plng) * 180 / Math.PI + 540) % 360 - 180;

            let curve = l.curve(['M',[pointFrom.lat,pointFrom.lng],
					   'Q',[lat * 180/Math.PI, long1],
						   [pointTo.lat, pointTo.lng]], {color: settings.routes.getColor()} );
            
            return curve;
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

           /* for (var item in markerList) {
                let markerWithArcs = markerList[item];

                let newLabels = this.createMarkerDirectionLabels(markerWithArcs.marker, markerWithArcs.arcs, markerWithArcs.airportCode);

                newLabels.forEach((item) => {
                    outOfBorderLabels.push(item);
                });
            }*/

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
            element.bindPopup(content, { autoPan: false });

            let map = this.map;
            element.on("mouseover", function (e) {
                this.openPopup(this, e.latlng);
            });
            element.on('mouseout', function (e) {
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
                
                let isMultipleSelection = (e as L.MouseEvent).originalEvent.ctrlKey;
                
                if(!connectionMapMarker || (connectionMapMarker.isSelected && !isMultipleSelection)) {
                    return;
                }
                
                connectionMapMarker.arcs.map((value) => {
                    if(!connectionMapMarker.isSelected || value.isSelected) {
                        arcSelectionIds.push(value.selectionId);
                    }
                });
                
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
                    
                    connectionMapMarker.isSelected = !connectionMapMarker.isSelected;
                    me.setSelectionStyle(connectionMapMarker.isSelected, connectionMapMarker.marker);
                    
                    connectionMapMarker.arcs.forEach((item) => {
                        if (item.isSelected !== connectionMapMarker.isSelected) {
                            item.isSelected = connectionMapMarker.isSelected;
                            me.setSelectionStyle(item.isSelected, item.arc);
                            
                            item.markers.forEach((marker) => {
                                if (marker !== connectionMapMarker) {
                                    marker.isSelected = connectionMapMarker.isSelected;
                                    me.setSelectionStyle(marker.isSelected, marker.marker);
                                }
                            });
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
                
                let isMultipleSelection = (e as L.MouseEvent).originalEvent.ctrlKey;
                
                if(!connectionMapArc || (connectionMapArc.isSelected && !isMultipleSelection)) {
                    return;
                }
                
                let selectedId: ISelectionId = connectionMapArc.selectionId;              
                           
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
                    
                    connectionMapArc.isSelected = !connectionMapArc.isSelected;
                    me.setSelectionStyle(connectionMapArc.isSelected, connectionMapArc.arc);

                    connectionMapArc.markers.forEach((item: ConnectionMapMarker) => {  
                        let markerGotSelectedElements = false;
                        
                        for(var i in item.arcs) {
                            if(item.arcs[i].isSelected == true) {
                                markerGotSelectedElements = true;
                                break;
                            }
                        }
                        
                        if(markerGotSelectedElements !== item.isSelected) {                      
                            item.isSelected = !item.isSelected;                          
                            me.setSelectionStyle(item.isSelected, item.marker);
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
        
        private parseDataViewToDirections(dataView: DataView): Direction[] {
            let directions: Direction[] = [];

            let marketCategory = dataView.categorical.categories[0];
            let codesFrom: any[] = dataView.categorical.categories[1].values,
                codesTo: any[] = dataView.categorical.categories[2].values,
                markets: any[] = dataView.categorical.categories[0].values;

            let latsFrom: any[] = dataView.categorical.values[0].values,
                latsTo: any[] = dataView.categorical.values[2].values,
                longsFrom: any[] = dataView.categorical.values[1].values,
                longsTo: any[] = dataView.categorical.values[3].values;           
                
            let tooltipColumns: DataViewValueColumn[] = [];
            
            for(var i in dataView.categorical.values) {
                let column = dataView.categorical.values[i];
                if(column.source && column.source.roles["tooltips"]) {
                    tooltipColumns.push(column);
                }
            }    
            
            let tooltips: string[] = [];
            
            if(tooltipColumns.length > 0) {
                for(var k = 0; k < tooltipColumns[0].values.length; ++k) {
                    let tooltip: string = tooltipColumns[0].source.displayName + ": " + tooltipColumns[0].values[k];
                    
                    for(var j = 1; j < tooltipColumns.length; ++j) {
                        tooltip += "<br>" + tooltipColumns[j].source.displayName  + ": " + tooltipColumns[j].values[k];
                    }
                    
                    tooltips.push(tooltip);
                }
            }      

            markets.forEach((item: any, index: number) => {                
                directions.push({
                    market: markets[index],
                    index: index,
                    airportCodeFrom: codesFrom[index],
                    airportCodeTo: codesTo[index],
                    latitudeFrom: latsFrom[index],
                    longitudeFrom: longsFrom[index],
                    latitudeTo: latsTo[index],
                    longitudeTo: longsTo[index],
                    tooltip: tooltips[index]
                });
            });
            
            return directions;
        }
        
        private createConnectionMapArc(direction: Direction, 
                                       settings: ConnectionMapSettings, 
                                       selectionCategoryColumn: DataViewCategoricalColumn): ConnectionMapArc {
                                           
            let fromLatLng = L.latLng(direction.latitudeFrom, direction.longitudeFrom),
                toLatLng = L.latLng(direction.latitudeTo, direction.longitudeTo);            

            let airportCodeFrom = direction.airportCodeFrom,
                airportCodeTo = direction.airportCodeTo;

            //let arc = this.createCustomizableArc(fromLatLng, toLatLng, settings);
            let arc = this.createCurvedLine(fromLatLng, toLatLng, direction.market, settings);
            
            this.setPopupToElement(direction.tooltip, arc);
            this.setOnArcClickEvent(arc);

            let selectionId = this.host.createSelectionIdBuilder()
                .withCategory(selectionCategoryColumn, direction.index)
                .createSelectionId();

            return {
                arc: arc,
                markers: [],
                isSelected: false,
                selectionId: selectionId
            };
        }
        
        private createConnectionMapMarker(direction: Direction, isDestinationPoint: boolean, latLng: L.LatLng, settings: ConnectionMapSettings): ConnectionMapMarker {                
            
            let marker = this.createCustomizableMarker(latLng, settings);

            let label = isDestinationPoint ? direction.airportCodeTo : direction.airportCodeFrom;
            this.setLabelToElement(label, marker);

            let lat = isDestinationPoint ? direction.latitudeTo : direction.latitudeFrom;
            let long = isDestinationPoint ? direction.longitudeTo : direction.longitudeFrom;
            
            let popupMessage = "Lat: " + lat + "<br>Long: " + long;
            this.setPopupToElement(popupMessage, marker);
            this.setOnMarkerClickEvent(marker);

            return {
                marker: marker,
                arcs: [], 
                airportCode: direction.airportCodeFrom,
                isSelected: false
            };
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

            let directions = this.parseDataViewToDirections(dataView);
            
            let marketCategory = dataView.categorical.categories[0];

            let processedArcs: ConnectionMapArcList = {},
                processedMarkers: ConnectionMapMarkerList = {};

            let markersLayer: L.FeatureGroup = L.featureGroup(),
                arcsLayer: L.FeatureGroup = L.featureGroup(),
                labelsLayer: L.FeatureGroup = L.featureGroup();

            for (var item in directions) {
                let direction = directions[item];
                let keyArc = direction.market,
                    keyFrom = direction.airportCodeFrom,
                    keyTo = direction.airportCodeTo;                    

                let connectionMapArc = this.createConnectionMapArc(direction, settings, marketCategory);    

                processedArcs[keyArc] = connectionMapArc;
                arcsLayer.addLayer(connectionMapArc.arc);

                let connectionMapMarkerFrom: ConnectionMapMarker,
                    connectionMapMarkerTo: ConnectionMapMarker;

                if (!processedMarkers[keyFrom]) {
                    let fromLatLng = L.latLng(direction.latitudeFrom, direction.longitudeFrom);
                    connectionMapMarkerFrom = this.createConnectionMapMarker(direction, false, fromLatLng, settings);

                    processedMarkers[keyFrom] = connectionMapMarkerFrom;
                    markersLayer.addLayer(connectionMapMarkerFrom.marker);
                } else {
                    connectionMapMarkerFrom = processedMarkers[keyFrom];
                }

                if (!processedMarkers[keyTo]) {
                    let toLatLng = L.latLng(direction.latitudeTo, direction.longitudeTo); 
                    connectionMapMarkerTo = this.createConnectionMapMarker(direction, true, toLatLng, settings);

                    processedMarkers[keyTo] = connectionMapMarkerTo;
                    markersLayer.addLayer(connectionMapMarkerTo.marker);
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
                
                let multipleSelection = (e as L.MouseEvent).originalEvent.ctrlKey;
                
                if(multipleSelection) {
                    return;
                }
                
                if (me.mapGotActiveSelections()) {
                    me.selectionManager.clear().then(() => {
                        me.unselectAll();
                    });
                }
            });
        }
    }
}