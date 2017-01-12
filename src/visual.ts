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
    
    const labelSelector = ".route-map-label";
    const labelClassName = "route-map-label";
    export class Visual implements IVisual {
        
        private routeMapDataView: RouteMapDataView;
        private targetHtmlElement: HTMLElement;
        private hostContainer: JQuery;
        private map: any;
        private dataIsNotEmpty: boolean;
        private isDataValid: boolean = false;
        private selectionManager: ISelectionManager;
        private host: IVisualHost;
        private isFirstMultipleSelection: boolean = true;
        private thicknessOptions: ThicknessOptions;

        private settings: RouteMapSettings;

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
                            arcColor: this.settings.routes.getArcColor(),
                            defaultThickness: this.settings.routes.defaultThickness,
                            minThickness: this.settings.routes.minThickness,     
                            maxThickness: this.settings.routes.maxThickness               
                        },
                        selector: null
                    });
                    break;
                case 'markers': 
                    objectEnumeration.push({
                        objectName: objectName,
                        displayName: "Markers",
                        properties: {
                            markerColor: this.settings.markers.getMarkerColor(),
                            labelFontColor: this.settings.markers.getLabelFontColor(),
                            
                            radius: this.settings.markers.radius                           
                        },
                        selector: null
                    });
                    break;
                case 'state1': 
                    objectEnumeration.push({
                        objectName: objectName,
                        displayName: "State 1",
                        properties: {
                            stateColor: this.settings.state1.getStateColor(),
                            dataMin: this.settings.state1.dataMin,
                            dataMax: this.settings.state1.dataMax
                        },
                        selector: null
                    });
                    break;
                case 'state2': 
                    objectEnumeration.push({
                        objectName: objectName,
                        displayName: "State 2",
                        properties: {
                            stateColor: this.settings.state2.getStateColor(),
                            dataMin: this.settings.state2.dataMin,
                            dataMax: this.settings.state2.dataMax
                        },
                        selector: null
                    });
                    break;
                case 'state3': 
                    objectEnumeration.push({
                        objectName: objectName,
                        displayName: "State 3",
                        properties: {
                            stateColor: this.settings.state3.getStateColor(),
                            dataMin: this.settings.state3.dataMin,
                            dataMax: this.settings.state3.dataMax
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

            this.map = L.map('map').setView([33.9415839, -118.4435494], 3);

            //add map tile
            var layer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                        attribution: 'Map data &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors, <a href="http://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>',
                        maxZoom: 18
            }).addTo(this.map);

            this.routeMapDataView = {
                markers: {},
                arcs: {},
                arcsLayer: L.featureGroup(),
                markersLayer: L.featureGroup()
            };

            this.setMapHandlers();
        }

        public update(options: VisualUpdateOptions): void {
            // render new data if dataset was changed
            if (options.type == VisualUpdateType.Data || options.type == VisualUpdateType.All) {
                let dataView: DataView = options
                    && options.dataViews
                    && options.dataViews[0];

                this.clearMap();
                this.routeMapDataView = this.converter(dataView);
                this.render();
            }

            this.map.invalidateSize();
            this.updateContainerViewports(options.viewport);
        }

        private parseSettings(dataView: DataView): RouteMapSettings {
            return RouteMapSettings.parse<RouteMapSettings>(dataView);
        }
        
        private midpointTo(pointFrom: L.LatLng, pointTo: L.LatLng): L.LatLng {
            return L.latLng((pointFrom.lat + pointTo.lat) / 2, (pointFrom.lng + pointTo.lng) / 2);
        };
        
        private getRoot(angleCoeficient: number, radianLatitude: number, radianLongitude: number, distance: number): number[] {
            
            var x0 = radianLatitude;
            var y0 = radianLongitude;
            
            var k1 = angleCoeficient;
            var k2 = -k1 * x0 + y0;            
            
            var a = k1 * k1 + 1;
            var b = 2 * k1 * k2 - 2 * x0 - 2 * k1 * y0;
            var c = x0 * x0 + k2 * k2 - 2 * y0 * k2 + y0 * y0 - distance * distance;
	
            var d = b * b - 4 * a * c;
            
            var x1 = -b / ( 2 * a ) - Math.sqrt( d ) / ( 2 * a );
            var x2 = -b / ( 2 * a ) + Math.sqrt( d ) / ( 2 * a );
            
            let rootArray = [];
            rootArray.push(x1);
            rootArray.push(x2);
            
            return rootArray;
        }
        
        private getSpecialPointLatLng(fromLatLng: L.LatLng, toLatLng: L.LatLng, midLatLng: L.LatLng): L.LatLng {
            let midLatRadian = midLatLng.lat * Math.PI / 180;
            let midLngRadian = midLatLng.lng * Math.PI / 180;
            
            let ang1 = (toLatLng.lng - fromLatLng.lng) / (toLatLng.lat - fromLatLng.lat);
            let ang2 = -(toLatLng.lat - fromLatLng.lat) / (toLatLng.lng - fromLatLng.lng);   
            
            let deltaLat = toLatLng.lat - midLatLng.lat;
            let deltaLng = toLatLng.lng - midLatLng.lng;   
            
            let distance = Math.sqrt(deltaLat * deltaLat + deltaLng * deltaLng)* Math.PI / 180;     
            
            distance = distance > 0.5 ? distance / 2 : distance;
            
            let latitudes = this.getRoot(ang2, midLatRadian, midLngRadian, distance);
            let lat = fromLatLng.lat > 0 && toLatLng.lat > 0 ? latitudes[1]: latitudes[0];
            let long = ((ang2 * (lat - midLatRadian) + midLngRadian) * 180 / Math.PI + 540) % 360 - 180;   
            
            return L.latLng(lat * 180/Math.PI, long);  
        }
        
        private createCurvedLine(direction: Direction, settings: RouteMapSettings): L.Polyline {
            let l: any = L;
            
            let pointFrom = L.latLng(direction.latitudeFrom, direction.longitudeFrom),
                pointTo = L.latLng(direction.latitudeTo, direction.longitudeTo); 
            
            let midpoint = this.midpointTo(pointFrom, pointTo);                    
            
            let specialPoint = this.getSpecialPointLatLng(pointFrom, pointTo, midpoint);                            
            
            let stateValue = direction.stateValue;
            let color;
            
            if(stateValue !== undefined) {
                if (stateValue <= settings.state1.dataMax && stateValue >= settings.state1.dataMin) {
                    color = settings.state1.getStateColor();

                } else if (stateValue <=  settings.state2.dataMax && stateValue >= settings.state2.dataMin) {
                    color = settings.state2.getStateColor();

                } else if (stateValue <= settings.state3.dataMax && stateValue >= settings.state3.dataMin) {
                    color = settings.state3.getStateColor();
                } else {
                    color = settings.routes.getArcColor();
                }
            } else {
                color = settings.routes.getArcColor();
            }
            
            let thickness = this.thicknessOptions 
                        ? settings.routes.minThickness + (direction.thickness - this.thicknessOptions.minValue) * this.thicknessOptions.coeficient 
                        : settings.routes.defaultThickness;
            
            let curve = l.curve(['M',[pointFrom.lat, pointFrom.lng],
					   'Q',[specialPoint.lat, specialPoint.lng],
						   [pointTo.lat, pointTo.lng]], {color: color, weight: thickness} );
            
            return curve;
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
            
            if(!content) {
                return;
            }         
                           
            element.bindPopup(content, { autoPan: false });                  

            let map = this.map;
            
            element.on("mouseover", function (e) {
                this.openPopup(this, e.latlng);
            });
            
            element.on('mouseout', function (e) {
                if(this.getPopup().getContent()) {
                    this.closePopup();
                }                
            });
        }

        private setLabelToElement(content: string, element: any): void {
            element.bindTooltip(content, { permanent: true, className: "route-map-label", offset: [0, 0] });
        }

        private setSelectionStyle(selected: boolean, element: L.Path): void {
            let opacity: number = selected ? 1 : 0.3;

            element.setStyle({
                opacity: opacity,
                fillOpacity: opacity
            });
        }

        private unselectAll(): void {
            let markers = this.routeMapDataView.markers;
            let arcs = this.routeMapDataView.arcs;

            for (var item in arcs) {
                arcs[item].isSelected = false;
                this.setSelectionStyle(true, arcs[item].arc);
            }

            for (var item in markers) {
                markers[item].isSelected = false;
                this.setSelectionStyle(true, markers[item].marker);
            }
            
            this.isFirstMultipleSelection = true;
        }

        private setOnMarkerClickEvent(element: L.CircleMarker): void {
            let me = this;

            element.on('click', function (e) {                
                let markers = me.routeMapDataView.markers;
                let arcs = me.routeMapDataView.arcs;
                
                let arcSelectionIds: ISelectionId[] = [];
                
                let routeMapMarker: RouteMapMarker;
                
                for(var item in markers) {
                    if(markers[item].marker === this) {
                        routeMapMarker = markers[item];
                        break;
                    }
                } 
                
                let isMultipleSelection = (e as L.MouseEvent).originalEvent.ctrlKey;
                
                if(!routeMapMarker || (routeMapMarker.isSelected && !isMultipleSelection)) {
                    return;
                }
                
                routeMapMarker.arcs.map((value) => {
                    if(!routeMapMarker.isSelected || value.isSelected) {
                        arcSelectionIds.push(value.selectionId);
                    }
                });
                
                me.selectionManager.select(arcSelectionIds, isMultipleSelection).then((ids: ISelectionId[]) => {                    
                    
                    if (me.isFirstMultipleSelection || !isMultipleSelection) {
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
                        
                        me.isFirstMultipleSelection = false;                   
                    }  
                    
                    routeMapMarker.isSelected = !routeMapMarker.isSelected;
                    me.setSelectionStyle(routeMapMarker.isSelected, routeMapMarker.marker);
                    
                    routeMapMarker.arcs.forEach((item) => {
                        if (item.isSelected !== routeMapMarker.isSelected) {
                            item.isSelected = routeMapMarker.isSelected;
                            me.setSelectionStyle(item.isSelected, item.arc);
                            
                            item.markers.forEach((marker) => {
                                if (marker !== routeMapMarker) {
                                    marker.isSelected = routeMapMarker.isSelected;
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
                (e as L.MouseEvent).originalEvent.preventDefault();              
                
                let markers = me.routeMapDataView.markers;
                let arcs = me.routeMapDataView.arcs;
                
                let routeMapArc: RouteMapArc;
                
                for(var item in arcs) {
                    if(arcs[item].arc === this) {
                        routeMapArc = arcs[item];
                        break;
                    }
                }                
                
                let isMultipleSelection = (e as L.MouseEvent).originalEvent.ctrlKey;
                
                if(!routeMapArc || (routeMapArc.isSelected && !isMultipleSelection)) {
                    return;
                }
                
                let selectedId: ISelectionId = routeMapArc.selectionId;              
                           
                me.selectionManager.select(selectedId, isMultipleSelection).then((ids: ISelectionId[]) => {
                    
                    if(me.isFirstMultipleSelection || !isMultipleSelection) {
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
                        
                        me.isFirstMultipleSelection = false;  
                    }       
                    
                    routeMapArc.isSelected = !routeMapArc.isSelected;
                    me.setSelectionStyle(routeMapArc.isSelected, routeMapArc.arc);

                    routeMapArc.markers.forEach((item: RouteMapMarker) => {  
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

        private createCustomizableMarker(latLng: L.LatLng, settings: RouteMapSettings): L.CircleMarker {

            let marker = L.circleMarker(latLng, {
                color: settings.markers.getMarkerColor(),
                fillColor:  settings.markers.getMarkerColor(),
                fillOpacity: 1,
                radius: settings.markers.radius
            });

            return marker;
        }

        private setLabelFontColor(color: string) {
            $(labelSelector).css("color", color);
        }

        public render(): void {
            this.map.addLayer(this.routeMapDataView.arcsLayer);
            this.map.addLayer(this.routeMapDataView.markersLayer);
            this.map.fitBounds(this.routeMapDataView.arcsLayer.getBounds());
            
            this.setLabelFontColor(this.settings.markers.getLabelFontColor());            
        }

        public clearMap(): void {
            let dataView = this.routeMapDataView;
            if (dataView && dataView.arcsLayer && dataView.markersLayer) {
                dataView.arcsLayer.clearLayers();
                dataView.markersLayer.clearLayers();
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
                longsTo: any[] = dataView.categorical.values[3].values,
                stateValues: any[],
                thicknesses: any[];           
                
            let tooltipColumns: DataViewValueColumn[] = [];
            
            for(var i in dataView.categorical.values) {
                let column = dataView.categorical.values[i];
                if(column.source && column.source.roles["tooltips"]) {
                    tooltipColumns.push(column);
                } 
                
                if(column.source && column.source.roles["stateValue"]) {
                    stateValues = column.values;
                } 
                
                if(column.source && column.source.roles["thickness"]) {
                    thicknesses = column.values;
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
                    locationFrom: codesFrom[index],
                    locationTo: codesTo[index],
                    latitudeFrom: latsFrom[index],
                    longitudeFrom: longsFrom[index],
                    latitudeTo: latsTo[index],
                    longitudeTo: longsTo[index],
                    stateValue: stateValues ? stateValues[index] : null,
                    thickness: thicknesses ? thicknesses[index] : null,
                    tooltip: tooltips[index]
                });
            });                      
            
            return directions;
        }
        
        private initThicknessCoefficient(directions: Direction[]) {
            if(!this.settings.routes.minThickness || !this.settings.routes.maxThickness) {
                return;
            }
            
            let minValue = Number.MAX_VALUE,
                maxValue = -Number.MAX_VALUE;
                
            directions.forEach((direction) => {
                if(direction.thickness && direction.thickness > maxValue) {
                    maxValue = direction.thickness;
                }
                
                if(direction.thickness && direction.thickness < minValue) {
                    minValue = direction.thickness;
                }
            });
            
            if(minValue == Number.MAX_VALUE || minValue === maxValue) {
                return;
            }
            
            let coef = (this.settings.routes.maxThickness - this.settings.routes.minThickness) / (maxValue - minValue);
            
            this.thicknessOptions = {
                coeficient: coef,
                minValue: minValue 
            };
        }
        
        private createRouteMapArc(direction: Direction, 
                                       settings: RouteMapSettings, 
                                       selectionCategoryColumn: DataViewCategoricalColumn): RouteMapArc {
                                           
            let fromLatLng = L.latLng(direction.latitudeFrom, direction.longitudeFrom),
                toLatLng = L.latLng(direction.latitudeTo, direction.longitudeTo);            

            let locationFrom = direction.locationFrom,
                locationTo = direction.locationTo;
            
            
            //let arc = this.createCustomizableArc(fromLatLng, toLatLng, settings);
            let arc = this.createCurvedLine(direction, settings);          

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
        
        private createRouteMapMarker(direction: Direction, isDestinationPoint: boolean, latLng: L.LatLng, settings: RouteMapSettings): RouteMapMarker {                
            
            let marker = this.createCustomizableMarker(latLng, settings);

            let label = isDestinationPoint ? direction.locationTo : direction.locationFrom;
            this.setLabelToElement(label, marker);

            let lat = isDestinationPoint ? direction.latitudeTo : direction.latitudeFrom;
            let long = isDestinationPoint ? direction.longitudeTo : direction.longitudeFrom;
            
            let popupMessage = "Lat: " + lat + "<br>Long: " + long;
            this.setPopupToElement(popupMessage, marker);
            this.setOnMarkerClickEvent(marker);

            return {
                marker: marker,
                arcs: [], 
                location: direction.locationFrom,
                isSelected: false
            };
        }

        public converter(dataView: DataView): RouteMapDataView {

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
                    markersLayer: L.featureGroup()
                };
            }                  

            let directions = this.parseDataViewToDirections(dataView);
            
            this.initThicknessCoefficient(directions);
            
            let marketCategory = dataView.categorical.categories[0];

            let processedArcs: RouteMapArcList = {},
                processedMarkers: RouteMapMarkerList = {};

            let markersLayer: L.FeatureGroup = L.featureGroup(),
                arcsLayer: L.FeatureGroup = L.featureGroup();

            for (var item in directions) {
                let direction = directions[item];
                let keyArc = direction.market,
                    keyFrom = direction.locationFrom,
                    keyTo = direction.locationTo;
                    
                if(!keyArc || !keyFrom || !keyTo 
                || !direction.latitudeFrom || !direction.latitudeTo 
                || !direction.longitudeFrom || !direction.longitudeTo) {
                    continue;
                }                    

                let routeMapArc = this.createRouteMapArc(direction, settings, marketCategory);    

                processedArcs[keyArc] = routeMapArc;
                arcsLayer.addLayer(routeMapArc.arc);

                let routeMapMarkerFrom: RouteMapMarker,
                    routeMapMarkerTo: RouteMapMarker;

                if (!processedMarkers[keyFrom]) {
                    let fromLatLng = L.latLng(direction.latitudeFrom, direction.longitudeFrom);
                    routeMapMarkerFrom = this.createRouteMapMarker(direction, false, fromLatLng, settings);

                    processedMarkers[keyFrom] = routeMapMarkerFrom;
                    markersLayer.addLayer(routeMapMarkerFrom.marker);
                } else {
                    routeMapMarkerFrom = processedMarkers[keyFrom];
                }

                if (!processedMarkers[keyTo]) {
                    let toLatLng = L.latLng(direction.latitudeTo, direction.longitudeTo); 
                    routeMapMarkerTo = this.createRouteMapMarker(direction, true, toLatLng, settings);

                    processedMarkers[keyTo] = routeMapMarkerTo;
                    markersLayer.addLayer(routeMapMarkerTo.marker);
                } else {
                    routeMapMarkerTo = processedMarkers[keyTo];
                }

                processedMarkers[keyFrom].arcs.push(routeMapArc);
                processedMarkers[keyTo].arcs.push(routeMapArc);
                processedArcs[keyArc].markers.push(routeMapMarkerFrom);
                processedArcs[keyArc].markers.push(routeMapMarkerTo);
            }

            this.isDataValid = true;                  

            return {
                arcs: processedArcs,
                markers: processedMarkers,
                markersLayer: markersLayer,
                arcsLayer: arcsLayer
            };
        }

        private handleMove(): void {
            if (!this.isDataValid) {
                return;
            }

            let markers = this.routeMapDataView.markers;
        }

        private setMapHandlers(): void {
            let me = this;

            this.map.on('zoom', function (e) {
                me.handleMove();
            });

            this.map.on('moveend', function (e) {
                me.handleMove();
            });

            this.map.on('click', function (e) {                
                let multipleSelection = (e as L.MouseEvent).originalEvent.ctrlKey;
                let defaultPrevented = (e as L.MouseEvent).originalEvent.defaultPrevented;
                
                if(multipleSelection || defaultPrevented) {
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