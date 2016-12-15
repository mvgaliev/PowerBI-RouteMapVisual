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
        private target: HTMLElement;
        private element: HTMLElement;
        private hostContainer: JQuery;     
        private clientWidth: number;
        private clientHeight: number;
        private map: any;
        private dataIsNotEmpty: boolean;
        private lines: L.Polyline[];
        private markers: L.Marker[];
        private linesLayer: L.FeatureGroup;
        private markersLayer: L.FeatureGroup;
        private settings: ConnectionMapSettings;

        constructor(options: VisualConstructorOptions) {        
			this.init(options);
        }
		
		public init(options: VisualConstructorOptions): void {
			// add LeafletJS map DIV tag
            this.target = options.element;
            this.clientHeight = options.element.clientHeight;
            this.clientWidth = options.element.clientWidth;
            this.markers = [];
            this.lines = [];
            this.linesLayer = L.featureGroup();
            this.markersLayer = L.featureGroup();
            
            var div = document.createElement('div');
            div.setAttribute("id", "map");
            div.setAttribute("style", "height:550px");
            div.setAttribute("class", "none");

			this.target.appendChild(div);

			this.hostContainer = $(this.target).css('overflow-x', 'hidden');
            this.createMap();
        }
        
        public createMap(): void {
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
            // handle resize              
            if(options.type == VisualUpdateType.Data) {
                let dataView: DataView = options
                    && options.dataViews
                    && options.dataViews[0];  
                                   
                this.connectionMapDataView = this.converter(dataView);  
                this.clearMap();              
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
        
        private setOnMarkerClickEvent(element: any) {
            let markers = this.markers; 
            
            element.on('click', function (e) {
                markers.forEach((item: any) => {
                    item.setStyle({
                        opacity: 0.3
                    });
                });
                
                this.setStyle({
                    opacity: 1
                });
            });
        }
        
        private setOnLineClickEvent(element: any) {
            let lines = this.lines; 
            
            element.on('click', function (e) {
                lines.forEach((item: any) => {
                    item.setStyle({
                        opacity: 0.3
                    });
                });
                
                this.setStyle({
                    opacity: 1
                });
            });
        }
        
       /* private createMarker(destination: Destination): any {
            let l: any = L; 
            
            let fromLatLng = L.latLng(destination.latitudeFrom, destination.longitudeFrom),
                    toLatLng = L.latLng(destination.latitudeTo, destination.longitudeTo); 
            
            let marker = l.circleMarker(fromLatLng, {
                                    color: this.settings.markers.fill,
                                    fillColor: this.settings.markers.fill,
                                    radius: 7
                                });                
                    
            marker.bindTooltip(destination.airportNameFrom, {permanent: true});                                                 

    
            this.setOnMarkerClickEvent(marker);
            this.setPopup("Lat: " + destination.latitudeFrom + "<br>Long: " + destination.longitudeFrom, markerFrom);
            this.markers.push(marker);marker
            this.markersLayer.addLayer(marker);
            addedMarkers[destination.airportNameFrom] = {};
        }*/
        
        public render(): void {       
            let addedMarkers: any = {};                 
              
            let lines = this.lines; 
            this.connectionMapDataView.destinations.forEach((item: Destination, index: number) => {
                let fromLatLng = L.latLng(item.latitudeFrom, item.longitudeFrom),
                    toLatLng = L.latLng(item.latitudeTo, item.longitudeTo); 
                    
                let l: any = L;                 
                
                if(!addedMarkers[item.airportNameFrom]){
                    let markerFrom = l.circleMarker(fromLatLng, {
                                    color: "green",
                                    fillColor: "green",
                                    radius: 7
                                });                
                    
                    markerFrom.bindTooltip(item.airportNameFrom, {permanent: true});                                                 

            
                    this.setOnMarkerClickEvent(markerFrom);
                    this.setPopup("Lat: " + item.latitudeFrom + "<br>Long: " + item.longitudeFrom, markerFrom);
                    this.markers.push(markerFrom);     
                    this.markersLayer.addLayer(markerFrom);
                    addedMarkers[item.airportNameFrom] = {};
                }
                
                if(!addedMarkers[item.airportNameTo]){
                    let markerTo = l.circleMarker(toLatLng, {
                                    color: "green",
                                    fillColor: "green",
                                    radius: 7
                                });
                                
                    markerTo.bindTooltip(item.airportNameTo, {permanent: true});

                    this.setOnMarkerClickEvent(markerTo);                    
                    this.setPopup("Lat: " + item.latitudeTo + "<br>Long: " + item.longitudeTo, markerTo);  
                    this.markers.push(markerTo);           
                    this.markersLayer.addLayer(markerTo);
                    addedMarkers[item.airportNameTo] = {};
                }                                    
                
                let line = l.Polyline.Arc(fromLatLng, toLatLng, {
                    color: "green",
                    vertices: 250
                });   
                
                this.setPopup("Flight numbers: " + item.flightNumbers.join(", "), line);                         
                                         
                this.setOnLineClickEvent(line);                
                this.lines.push(line);
                this.linesLayer.addLayer(line);                             
            });
            
            this.map.addLayer(this.linesLayer);
            this.map.addLayer(this.markersLayer);
        }
        
        public clearMap(): void {
           this.linesLayer.clearLayers();
           this.markersLayer.clearLayers();
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

                return {
                    destinations: []
                };
            }

            debugger;
            
            let destinationsPreData: any = {};
            
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
                
                if(!destinationsPreData[key]) {
                    destinationsPreData[key] = {
                        key: key,
                        airportNameFrom: namesFrom[index],
                        latitudeFrom: latsFrom[index],
                        longitudeFrom: longsFrom[index],
                        airportNameTo: namesTo[index],
                        latitudeTo: latsTo[index],
                        longitudeTo: longsTo[index],
                        flightNumbers: []
                    }
                } 
                
                destinationsPreData[key].flightNumbers.push(flightNumbers[index]);                        
            });    
            
            let destinations: Destination[] = []; 
            
            for(let key in destinationsPreData) {
                if (destinationsPreData.hasOwnProperty(key)) {
                    destinations.push(destinationsPreData[key]);
                }
            }       
            
            return { destinations };    
        }
    }
}