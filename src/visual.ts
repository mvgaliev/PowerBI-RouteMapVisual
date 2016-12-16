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
    export class Visual implements IVisual {
        
        private connectionMapDataView: ConnectionMapDataView;
        private targetHtmlElement: HTMLElement;
        private hostContainer: JQuery;     
        private map: any;
        private dataIsNotEmpty: boolean;
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
        
        private setPopup(content: string, element: any) {
            element.bindPopup(content);
            
            element.on("mouseover", function (e) {
                this.openPopup();
            });
            element.on('mouseout', function (e) {
                this.closePopup();
            });            
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
        
        private createClickableMarkerWithLabelAndPopup(latLng: L.LatLng, popupMessage: string, label: string): L.CircleMarker {
           
            let marker = L.circleMarker(latLng, {
                color: this.settings.markers.fill,
                fillColor: this.settings.markers.fill,
                radius: 7
            });                
                    
            marker.bindTooltip(label, { permanent: true });                                                
    
            this.setOnMarkerClickEvent(marker);
            this.setPopup("Lat: " + latLng.lat + "<br>Long: " + latLng.lng, marker);            
            
            return marker;
        }            
        
        public render(): void {          
            this.map.addLayer(this.connectionMapDataView.arcsLayer);
            this.map.addLayer(this.connectionMapDataView.markersLayer);
        }
        
        public clearMap(): void {
           
           if(this.connectionMapDataView && this.connectionMapDataView.arcsLayer && this.connectionMapDataView.markersLayer) {
               this.connectionMapDataView.arcsLayer.clearLayers();
               this.connectionMapDataView.markersLayer.clearLayers();
           }
        }
        
        public converter(dataView: DataView): ConnectionMapDataView {            
            
            this.settings = this.parseSettings(dataView); 
            
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

                return  {
                    arcs: {},
                    arcsLayer: L.featureGroup(),
                    markers: {},
                    markersLayer: L.featureGroup()
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
                let codeFrom: any =  item,
                    codeTo: any = codesTo[index];
                
                let key = (codeFrom + codeTo) < (codeTo + codeFrom) ? (codeFrom + codeTo) : (codeTo + codeFrom);
                
                if(!directions[key]) {
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
            
            let l: any = L;    
            let arcs: ConnectionMapArcList = {},
                markers: ConnectionMapMarkerList = {};
                
            let markersLayer: L.FeatureGroup = L.featureGroup(),
                arcsLayer: L.FeatureGroup = L.featureGroup(); 
                        
            for(var item in directions) {
                let direction = directions[item];
                
                let fromLatLng = L.latLng(direction.latitudeFrom, direction.longitudeFrom),
                    toLatLng = L.latLng(direction.latitudeTo, direction.longitudeTo); 
                                    
                let keyArc = direction.key,
                    keyFrom = direction.airportCodeFrom,
                    keyTo = direction.airportCodeTo;                                                             
                
                if(!arcs[keyArc]) {
                    let arc = l.Polyline.Arc(fromLatLng, toLatLng, {
                        color: "red",
                        vertices: 250
                    });   
                    
                    this.setPopup("Flight numbers: " + direction.flightNumbers.join(", "), arc);                         
                                            
                    this.setOnArcClickEvent(arc);                
                    arcs[keyArc] = { arc: arc, markers: [] };
                    arcsLayer.addLayer(arc);  
                    
                    if(!markers[keyFrom]){
                        let popupMessage = "Lat: " + direction.latitudeFrom + "<br>Long: " + direction.longitudeFrom;
                        let markerFrom = this.createClickableMarkerWithLabelAndPopup(fromLatLng, popupMessage, direction.airportNameFrom);
                        
                        markers[keyFrom] = { marker: markerFrom, arcs: [] };     
                        markersLayer.addLayer(markerFrom);                        
                    } 
                    
                    if(!markers[keyTo]){
                        let popupMessage = "Lat: " + direction.latitudeTo + "<br>Long: " + direction.longitudeTo;
                        let markerTo = this.createClickableMarkerWithLabelAndPopup(toLatLng, popupMessage, direction.airportNameTo);
                        
                        markers[keyTo] = { marker: markerTo, arcs: [] };   
                        markersLayer.addLayer(markerTo);                        
                    }   
                    
                    markers[keyFrom].arcs.push(arc);
                    markers[keyTo].arcs.push(arc);
                    arcs[keyArc].markers.push(markers[keyFrom].marker);
                    arcs[keyArc].markers.push(markers[keyTo].marker);
                }
            }  
            
            return { 
                arcs: arcs,
                markers: markers,
                markersLayer: markersLayer,
                arcsLayer: arcsLayer
            };    
        }
    }
}