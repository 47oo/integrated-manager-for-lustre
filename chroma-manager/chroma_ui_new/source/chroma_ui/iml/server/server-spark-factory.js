//
// INTEL CONFIDENTIAL
//
// Copyright 2013-2015 Intel Corporation All Rights Reserved.
//
// The source code contained or described herein and all documents related
// to the source code ("Material") are owned by Intel Corporation or its
// suppliers or licensors. Title to the Material remains with Intel Corporation
// or its suppliers and licensors. The Material contains trade secrets and
// proprietary and confidential information of Intel or its suppliers and
// licensors. The Material is protected by worldwide copyright and trade secret
// laws and treaty provisions. No part of the Material may be used, copied,
// reproduced, modified, published, uploaded, posted, transmitted, distributed,
// or disclosed in any way without Intel's prior express written permission.
//
// No license under any patent, copyright, trade secret or other intellectual
// property right is granted to or conferred upon you by disclosure or delivery
// of the Materials, either expressly, by implication, inducement, estoppel or
// otherwise. Any license under such intellectual property rights must be
// express and approved by Intel in writing.


angular.module('server').factory('serverSpark', ['requestSocket', 'CACHE_INITIAL_DATA',
  function serverSparkFactory (requestSocket, CACHE_INITIAL_DATA) {
    'use strict';

    var lastResponse = {
      statusCode: 200,
      body: {
        objects: CACHE_INITIAL_DATA.host
      }
    };

    /**
     * Sets up a persistent connection to fetch all hosts
     * @returns {Object}
     */
    return function getServerSpark () {
      var spark = requestSocket();

      spark.setLastData(lastResponse);

      spark.sendGet('/host', {
        jsonMask: 'objects(id,address,available_actions,boot_time,fqdn,immutable_state,install_method,label,\
locks,member_of_active_filesystem,nids,nodename,resource_uri,server_profile,state)',
        qs: {
          limit: 0
        }
      });

      spark.on('data', function onData (response) {
        lastResponse = response;
      });

      return spark;
    };
  }
]);
