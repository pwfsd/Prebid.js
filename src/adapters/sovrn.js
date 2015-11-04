var CONSTANTS = require('../constants.json');
var utils = require('../utils.js');
var bidfactory = require('../bidfactory.js');
var bidmanager = require('../bidmanager.js');
var adloader = require('../adloader');

/**
 * Adapter for requesting bids from Sovrn
 */
var SovrnAdapter = function SovrnAdapter() {
	var sovrnUrl = 'ap.lijit.com/rtb/bid';

	function _callBids(params) {
		var sovrnBids = params.bids || [];
		// De-dupe by tagid then issue single bid request for all bids
		_requestBids(_getUniqueTagids(sovrnBids));
	}

	// filter bids to de-dupe them?
	function _getUniqueTagids(bids) {
		var key;
		var map = {};
		var Tagids = [];
		bids.forEach(function(bid) {
			map[utils.getBidIdParamater('tagid', bid.params)] = bid;
		});
		for (key in map) {
			if (map.hasOwnProperty(key)) {
				Tagids.push(map[key]);
			}
		}
		return Tagids;
	}

	function _requestBids(bidReqs) {
		// build bid request object
		
		var domain = window.location.host;
		var page = window.location.pathname + location.search + location.hash;
		
		var sovrnImps = [];
		
		//build impression array for sovrn
		bidReqs.forEach(function(bid)
		{
			var tagId = utils.getBidIdParamater('tagid', bid.params);
			var bidFloor = utils.getBidIdParamater('bidfloor', bid.params);
			
			//sovrn supports only one size per tagid, so we just take the first size if there are more
			imp = 
				{
					id: utils.getUniqueIdentifierStr(),
					banner: {
						w: bid.sizes[0][0],
						h: bid.sizes[0][1]
					},
					tagid: tagId,
					bidfloor: bidFloor
				}
			sovrnImps.push(imp);
			bidmanager.pbCallbackMap[imp.id] = bid;
		});

		// build bid request with impressions
		var sovrnBidReq = {
			id: utils.getUniqueIdentifierStr(),
			imp: sovrnImps,
			site:{ 
				domain: domain,
				page: page
			}
		}

		var scriptUrl = '//'+sovrnUrl+'?callback=window.pbjs.sovrnResponse' + 
			'&br=' + encodeURIComponent(JSON.stringify(sovrnBidReq));
		adloader.loadScript(scriptUrl, null);
	}

	//expose the callback to the global object:
	pbjs.sovrnResponse = function(sovrnResponseObj) {
		// valid object?
		if (sovrnResponseObj && sovrnResponseObj.id) {
			// @if NODE_ENV='debug'			
			if(utils.debugTurnedOn && utils.hasConsoleLogger()) { console.log(sovrnResponseObj) }; //only dump objects in debug build
			// @endif

			// valid object w/ bid responses?
			if (sovrnResponseObj.seatbid && sovrnResponseObj.seatbid.length !==0 && sovrnResponseObj.seatbid[0].bid && sovrnResponseObj.seatbid[0].bid.length !== 0) {

				sovrnResponseObj.seatbid[0].bid.forEach(function(sovrnBid){

					var responseCPM;
					var placementCode = '';
					var id = sovrnBid.impid;
					
					// try to fetch the bid request we sent Sovrn
					var	bidObj = bidmanager.getPlacementIdByCBIdentifer(id);
					if (bidObj){
						placementCode = bidObj.placementCode;
						bidObj.status = CONSTANTS.STATUS.GOOD;

						//place ad response on bidmanager._adResponsesByBidderId
						// @if NODE_ENV='debug'
						utils.logMessage('Sovrn bid process for ad ID: ' + id);
						// @endif
	
						var bid = [];
						responseCPM = parseFloat(sovrnBid.price);

						if(responseCPM !== 0) {		
							sovrnBid.placementCode = placementCode;
							sovrnBid.size = bidObj.sizes;
							var responseAd = sovrnBid.adm;
							
							// build impression url from response
							var responseNurl = '<img src="'+sovrnBid.nurl+'">'

							//store bid response
							//bid status is good (indicating 1)
							bid = bidfactory.createBid(1);
							bid.creative_id = sovrnBid.Id;
							bid.bidderCode = 'sovrn';
							bid.cpm = responseCPM;
						
							//set ad content + impression url
							// sovrn returns <script> block, so use bid.ad, not bid.adurl
							bid.ad = decodeURIComponent(responseAd+responseNurl);		
							bid.width = bidObj.sizes[0][0];
							bid.height = bidObj.sizes[0][1];
			
							bidmanager.addBidResponse(placementCode, bid);
							
						}	else {
							//0 price bid
							// @if NODE_ENV='debug'
							utils.logMessage('Sovrn responded with 0 bid for placement code ' + placementCode);
							// @endif
							//indicate that there is no bid for this placement
							bid = bidfactory.createBid(2);
							bid.bidderCode = 'sovrn';
							bidmanager.addBidResponse(placementCode, bid);
							
						}
					} else {   // bid not found, we never asked for this?
						//no response data
						// @if NODE_ENV='debug'
						utils.logMessage('No bid request found for sovrn impression ID '+id);
						// @endif						
					} 
				});
			} else {
				//no response data
				// @if NODE_ENV='debug'
				utils.logMessage('Incomplete sovrn response for id '+sovrnResponseObj.id);
				// @endif
			}
		} else {
			//no response data
			// @if NODE_ENV='debug'
			utils.logMessage('Sovrn callback received no valid object');
			// @endif
		}

	}; // sovrnResponse

	return {
		callBids: _callBids
	};
};

module.exports = SovrnAdapter;