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
        private lines: L.FeatureGroup;
        private markers: L.FeatureGroup;

        constructor(options: VisualConstructorOptions) {        
			this.init(options);
        }
		
		public init(options: VisualConstructorOptions): void {
			// add LeafletJS map DIV tag
            this.target = options.element;
            this.clientHeight = options.element.clientHeight;
            this.clientWidth = options.element.clientWidth;
            this.lines = L.featureGroup();
            this.markers = L.featureGroup();
            
            var div = document.createElement('div');
            div.setAttribute("id", "map");
            div.setAttribute("style", "height:550px");
            div.setAttribute("class", "none");

			this.target.appendChild(div);

			this.hostContainer = $(this.target).css('overflow-x', 'hidden');
            this.createMap();
        }
        
        public createMap(): void {
            this.map = L.map('map').setView([51.4707017, -0.4608747], 14);  
            
            var Esri_WorldStreetMap = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
                attribution: 'Tiles &copy; Esri &mdash; Source: Esri, DeLorme, NAVTEQ, USGS, Intermap, iPC, NRCAN, Esri Japan, METI, Esri China (Hong Kong), Esri (Thailand), TomTom, 2012'
            });
            
            this.map.addLayer(Esri_WorldStreetMap);
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
        
        public render(): void {            
            this.connectionMapDataView.destinations.forEach((item: Destination, index: number) => {
                let fromLatLng = L.latLng(item.latitudeFrom, item.longitudeFrom),
                    toLatLng = L.latLng(item.latitudeTo, item.longitudeTo); 
                    
                let l: any = L; 
                
                let markerFrom = l.marker(fromLatLng),
                    markerTo = l.marker(toLatLng);
                    
                this.markers.addLayer(markerFrom);
                this.markers.addLayer(markerTo);
                
                let line = l.Polyline.Arc(fromLatLng, toLatLng, {
                    color: 'red',
                    vertices: 300
                });            
                this.lines.addLayer(line);                             
            });
            
            this.map.addLayer(this.lines);
            this.map.addLayer(this.markers);
        }
        
        public clearMap(): void {
           this.lines.clearLayers();
        }
        
        public converter(dataView: DataView): ConnectionMapDataView {            
            
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