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

        private settings: ConnectionMapSettings;

        constructor(options: VisualConstructorOptions) {        
			this.init(options);
        }
		
		public init(options: VisualConstructorOptions): void {

            this.targetHtmlElement = options.element;

            this.addMapDivToDocument();			

			this.hostContainer = $(this.targetHtmlElement).css('overflow-x', 'hidden');
            this.initMap();
        }        

        public enumerateObjectInstances(options: EnumerateVisualObjectInstancesOptions): VisualObjectInstanceEnumeration {
            let objectName = options.objectName;
            let objectEnumeration: VisualObjectInstance[] = [];

            debugger;
            switch(objectName) {
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
            debugger;
            
            this.setMapHandlers();
        }

        public update(options: VisualUpdateOptions): void {
            // render new data if dataset was changed
            if(options.type == VisualUpdateType.Data) {
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
        
        private createMarkerDirectionLabels(marker: L.CircleMarker, arcs: L.Polyline[], title: string): L.Marker[] {
            let markerPoint = marker.getLatLng(),
                isMarkerInvisible = !this.isCoordVisible(markerPoint),
                nearestVisiblePoints: L.LatLng[] = [],
                labelLayer: L.FeatureGroup = L.featureGroup();
                
            if (isMarkerInvisible) {
                                
                for(var item in arcs) {
                    let arc = arcs[item],                    
                        coords = arc.getLatLngs();                   
                        
                    var isMarkerOnThePolyline = this.isMarkerOnTheLine(coords, markerPoint);
                    if (isMarkerOnThePolyline === 0)
                        continue;

                    if (isMarkerOnThePolyline === -1) {
                        for(var index in coords) {
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
            
            for(var item in markerList) {
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
        
        private setOnMarkerClickEvent(element: L.CircleMarker) {
            let me = this;             
            
            element.on('click', function (e) {
                let markers = me.connectionMapDataView.markers; 
                let arcs =  me.connectionMapDataView.arcs;
            
                this.setStyle({
                    opacity: 1
                });
                
                for(var item in arcs) {
                    arcs[item].arc.setStyle({
                        opacity: 0.3
                    });
                }                
                
                for(var item in markers) {
                    if(markers[item].marker !== this) {
                        markers[item].marker.setStyle({
                            opacity: 0.3
                        });                                        
                    } else {
                        markers[item].arcs.forEach((item: L.Polyline) => {
                            item.setStyle({
                               opacity: 1 
                            });
                        });
                    }                    
                }             
            });
        }
        
        private setOnArcClickEvent(element: L.Polyline) { 
            let me = this;  
            
            element.on('click', function (e) {
                let markers = me.connectionMapDataView.markers; 
                let arcs = me.connectionMapDataView.arcs;
                
                for(var item in markers) {
                    markers[item].marker.setStyle({
                        opacity: 0.3
                    });
                }  
                
                for(var item in arcs) {
                    if(arcs[item].arc !== this) {
                        arcs[item].arc.setStyle({
                            opacity: 0.3
                        });
                    } else {
                        let arc = arcs[item];
                        
                        arc.arc.setStyle({
                            opacity: 1
                        });
                        
                        arc.markers.forEach((item: L.CircleMarker) => {
                            item.setStyle({
                               opacity: 1 
                            });
                        });  
                    }                    
                }  
            });
        }
        
        private createConnectionMapArc(fromLatLng: L.LatLng, toLatLng: L.LatLng, settings: ConnectionMapSettings ): L.Polyline {
            
            let l: any = L;
            
            let arc = l.Polyline.Arc(fromLatLng, toLatLng, {
                color: settings.routes.getColor(),
                vertices: 250
            });            
            
            return arc;
        }
        
        private createConnectionMapMarker(latLng: L.LatLng, settings: ConnectionMapSettings): L.CircleMarker {
           
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
           if(dataView && dataView.arcsLayer && dataView.markersLayer && dataView.labelsLayer) {
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
                || !dataView.categorical.categories[3]
                || !dataView.categorical.categories[4]
                || !dataView.categorical.categories[0].values
                || !dataView.categorical.categories[1].values
                || !dataView.categorical.categories[2].values
                || !dataView.categorical.categories[3].values
                || !dataView.categorical.categories[4].values
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

            let directions: { [key: string]: Direction } = {};

            let codesFrom: any[] = dataView.categorical.categories[2].values,
                codesTo: any[] = dataView.categorical.categories[4].values,
                namesFrom: any[] = dataView.categorical.categories[1].values,
                namesTo: any[] = dataView.categorical.categories[3].values,
                flightNumbers: any = dataView.categorical.categories[0].values;

            let latsFrom: any[] = dataView.categorical.values[0].values,
                latsTo: any[] = dataView.categorical.values[2].values,
                longsFrom: any[] = dataView.categorical.values[1].values,
                longsTo: any[] = dataView.categorical.values[3].values;

            codesFrom.forEach((item: any, index: number) => {
                let codeFrom: any = item,
                    codeTo: any = codesTo[index];

                let key = (codeFrom + codeTo) < (codeTo + codeFrom) ? (codeFrom + codeTo) : (codeTo + codeFrom);

                if (!directions[key]) {
                    directions[key] = {
                        key: key,
                        airportCodeFrom: codesFrom[index],
                        airportCodeTo: codesTo[index],
                        airportNameFrom: namesFrom[index],
                        latitudeFrom: latsFrom[index],
                        longitudeFrom: longsFrom[index],
                        airportNameTo: namesTo[index],
                        latitudeTo: latsTo[index],
                        longitudeTo: longsTo[index],
                        flightNumbers: []
                    }
                }

                directions[key].flightNumbers.push(flightNumbers[index]);
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

                let keyArc = direction.key,
                    keyFrom = direction.airportCodeFrom,
                    keyTo = direction.airportCodeTo;
                    
                let airportNameFrom = direction.airportNameFrom,
                    airportNameTo = direction.airportNameTo;

                if (!processedArcs[keyArc]) {
                    let arc = this.createConnectionMapArc(fromLatLng, toLatLng, settings);     
                                   
                    let popupMessage = "Flight numbers: " + direction.flightNumbers.join(", ");
                    this.setPopupToElement(popupMessage, arc);
                    this.setOnArcClickEvent(arc);
                    
                    processedArcs[keyArc] = { arc: arc, markers: [] };
                    arcsLayer.addLayer(arc);

                    if (!processedMarkers[keyFrom]) {                        
                        let markerFrom = this.createConnectionMapMarker(fromLatLng, settings);
                        
                        let label = airportNameFrom;
                        this.setLabelToElement(label, markerFrom);
                        
                        let popupMessage = "Lat: " + direction.latitudeFrom + "<br>Long: " + direction.longitudeFrom;
                        this.setPopupToElement(popupMessage, markerFrom);
                        this.setOnMarkerClickEvent(markerFrom);

                        processedMarkers[keyFrom] = { marker: markerFrom, arcs: [], airportCode: direction.airportCodeFrom };
                        markersLayer.addLayer(markerFrom);
                    }

                    if (!processedMarkers[keyTo]) {                        
                        let markerTo = this.createConnectionMapMarker(toLatLng, settings);
                        
                        let label = airportNameFrom;
                        this.setLabelToElement(label, markerTo);
                        
                        let popupMessage = "Lat: " + direction.latitudeTo + "<br>Long: " + direction.longitudeTo;                        
                        this.setPopupToElement(popupMessage, markerTo);
                        this.setOnMarkerClickEvent(markerTo);

                        processedMarkers[keyTo] = { marker: markerTo, arcs: [], airportCode: direction.airportCodeTo };
                        markersLayer.addLayer(markerTo);
                    }

                    processedMarkers[keyFrom].arcs.push(arc);
                    processedMarkers[keyTo].arcs.push(arc);
                    processedArcs[keyArc].markers.push(processedMarkers[keyFrom].marker);
                    processedArcs[keyArc].markers.push(processedMarkers[keyTo].marker);
                }
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
            if(!this.isDataValid) {
                return;
            }
            
            let markers = this.connectionMapDataView.markers;
            let labelsLayer = this.connectionMapDataView.labelsLayer;                 
            
            labelsLayer.clearLayers();
            
            let showLayers = this.settings.routes.showOutOfMapMarkerLabels;            
            if(showLayers) {
                let outOfBorderLabels: L.Marker[] = this.createMarkersDirectionLabels(markers);        
                this.addMarkersToLayer(outOfBorderLabels, labelsLayer);    
            }
        }
        
        private setMapHandlers(): void {
            let me = this;
            
            this.map.on('zoom', function (e) {
                me.handleMove();
            });
            
            this.map.on('moveend', function (e) {
                me.handleMove();
            });
        }
    }
}