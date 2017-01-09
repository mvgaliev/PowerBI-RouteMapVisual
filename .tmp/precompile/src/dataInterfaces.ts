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

module powerbi.extensibility.visual.PBI_CV_DD900773_4713_45DE_BE5F_77B59D33F7DF  {
    export interface ConnectionMapDataView {
        markers: ConnectionMapMarkerList,
        arcs: ConnectionMapArcList,
        arcsLayer: L.FeatureGroup,
        markersLayer: L.FeatureGroup,
        labelsLayer: L.FeatureGroup
    }
    
    export interface ConnectionMapMarkerList {
        [key: string]: ConnectionMapMarker;
    }
    
    export interface ConnectionMapArcList {
        [key: string]: ConnectionMapArc;
    }
    
    export interface ConnectionMapMarker {
        marker: L.CircleMarker, 
        airportCode: string,
        arcs: ConnectionMapArc[],
        isSelected: boolean
    }
    
    export interface ConnectionMapArc {
        arc: L.Polyline, 
        markers: ConnectionMapMarker[],
        isSelected: boolean,
        selectionId: ISelectionId
    }
    
    export interface ConnectionMapAirport {
        code: string,
        latitude: number,
        longitude: number
    }
    
    export interface Direction {
        market: string,
        index: number,
        airportCodeFrom: string,
        airportCodeTo: string,
        latitudeFrom: number,
        longitudeFrom: number,
        latitudeTo: number,
        longitudeTo: number,
        tooltip: string      
    }
}