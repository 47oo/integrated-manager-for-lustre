var ERR_COMMON_DELETE_HOST = "Error in deleting host: ";
var ERR_COMMON_ADD_HOST = "Error in Adding host: ";
var ERR_COMMON_LNET_STATUS = "Error in setting lnet status: ";
var ERR_COMMON_FS_START = "Error in starting File System: ";
var ERR_COMMON_CREATE_OST = "Error in Creating OST: ";
var ERR_COMMON_CREATE_MGT = "Error in Creating MGT: ";
var ERR_COMMON_CREATE_MDT = "Error in Creating MDT: ";


RemoveHost_ServerConfig = function (host_id)
{
	$.post("/api/remove_host/",{"hostid":host_id}).success(function(data, textStatus, jqXHR) {
			if(data.success)
			{
				var response = data.response;		
				if(response.status != "")
				{
					jAlert("Host " + response.hostid + " Deleted");
					$('#server_configuration').dataTable().fnClearTable();
					LoadServerConf_ServerConfig();
				}
				else
				{
					jAlert("problem in deleting host");
				}
			}
			else
			{
				jAlert(ERR_COMMON_DELETE_HOST + data.error);
			}
		})
		.error(function(event) {
		  	jAlert(ERR_COMMON_DELETE_HOST + data.error);
		})
		.complete(function(event) {
		});
}

function Lnet_Operations(host_id, opps)
{
	$.post("/api/set_lnet_state/",{"hostid":host_id, "state":opps}).success(function(data, textStatus, jqXHR) {
		if(data.success)
		{
			var response = data.response;		
			if(response.status != "")
			{
				jAlert("State " + response.hostid + opps + " Changed");
				$('#server_configuration').dataTable().fnClearTable();
				LoadServerConf_ServerConfig();
			}
			else
			{
				alert("problem in deleting host");
			}
		}
		else
		{
			jAlert(ERR_COMMON_LNET_STATUS + data.error);
		}
	})
	.error(function(event) {
     	jAlert(ERR_COMMON_LNET_STATUS + data.error);
    })
	.complete(function(event) {
	});
}

function Add_Host_Table(dialog_id)
{
	//$('#host_status').remove();
	$('#status_tab').empty();
	$('#host_status').empty();
	var oTable = "<table width='100%' border='0' cellspacing='0' cellpadding='0' id='hostdetails'><tr><td width='41%' align='right' valign='middle'>Host name:</td><td width='60%' align='left' valign='middle'><input type='text' name='txtHostName' id='txtHostName' /></td></tr></table>";
	$("#" + dialog_id).dialog("option", "buttons", null);
			
			$("#" + dialog_id).dialog({ 
				buttons: { 
					"Close": function() { 
				     	 $(this).dialog("close");
      				},
					"Continue": function() { 
						AddHost_ServerConfig($('#txtHostName').val(),dialog_id); 
					} 
				}
			});
			
	$('#hostdetails_container').html(oTable);
}

function StartFileSystem(filesystem)
{
	alert(filesystem);
	/*
	$.post("/api/start_filesystem/",{"filesystem":filesysme}).success(function(data, textStatus, jqXHR) {
		if(data.success)
		{
			//FIXEME: implementation pending, pending in api
			var response = data.response;		
		}
	})
	.error(function(event) {
     	jAlert(ERR_COMMON_FS_START + data.error);
    })
	.complete(function(event) {
	});
	*/
}

function StopFileSystem(filesystem)
{
	alert(filesystem);
	/*
	$.post("/api/stop_filesystem/",{"filesystem":filesysme}).success(function(data, textStatus, jqXHR) {
		if(data.success)
		{
			//FIXEME: implementation pending, pending in api
			var response = data.response;		
		}
	})
	.error(function(event) {
     	jAlert(ERR_COMMON_FS_START + data.error);
    })
	.complete(function(event) {
	});
	*/
}

function setOSTArray(filesystemId, objOstid)
{
	for(var i=0;i<objOstid.length;i++)
	{
		$.post("/api/create_ost/",{"filesystemid":filesystemId, "nodeid":objOstid[i], "failoverid":"", "hostid":""}).success(function(data, textStatus, jqXHR) {
			if(data.success)
			{
				//FIXEME: hide loader here
				var response = data.response;		
			}
			else
			{
				jAlert(ERR_COMMON_CREATE_OST + data.errors);
			}
		})
		.error(function(event) {
			jAlert(ERR_COMMON_CREATE_OST + data.errors);
		})
		.complete(function(event) {
		});
	}
	//LoadOST_EditFS();
}

function CreateFS(fsname,mgs_id,mgt_node_id,mdt_node_id,ost_id)
{
	alert("/api/create_new_fs/{'fsname':" + fsname + "'mgs_id':" + mgs_id + "'mgt_node_id':" + mgt_node_id + "'mdt_node_id':" + mdt_node_id + "'ost_node_ids':" + GetOSTId(ost_id));
	//FixME: Add api call here
}

function GetOSTId(arrOST)
{
	var ost_id="";
	for(var i=0;i<arrOST.length;i++)
	{
		if (ost_id == "")
		{
		 ost_id = arrOST[i];
		}
		else
		{
			ost_id = ost_id + "," + arrOST[i];
		}
	}
	return ost_id;
}